import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '4c939e37-ef9f-4fb2-8231-319896c89080';
const BOOKING_ID = 'c6a502d6-6dd2-4a03-811e-694114f3122a';

const tx = vi.hoisted(() => ({
  privacyRequest: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), delete: vi.fn() },
  checkInRequest: { findMany: vi.fn(), updateMany: vi.fn() },
  stayRequest: { findMany: vi.fn(), update: vi.fn() },
  outboxEvent: { count: vi.fn(), updateMany: vi.fn() },
  bookingClaimGrant: { updateMany: vi.fn() },
  booking: { updateMany: vi.fn() },
  securityAuditEvent: { create: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  privacyRequest: { findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { eraseGuestByAdmin } from '@/lib/privacyService';

describe('admin guest erasure', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
    prismaMock.privacyRequest.findFirst.mockResolvedValue(null);
    prismaMock.privacyRequest.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data }));
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    tx.privacyRequest.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      requestType: 'ERASURE',
      status: 'VERIFIED',
      userId: USER_ID,
      subjectDigest: 'digest',
    }));
    tx.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: null,
      phoneE164: '+306912345678',
      bookings: [{ id: BOOKING_ID }],
    });
    tx.checkInRequest.findMany.mockResolvedValue([{ id: 'check-in-1' }]);
    tx.stayRequest.findMany.mockResolvedValue([{ id: '4cc518e3-dbeb-48b1-bc21-7ac3c9a810bf' }]);
    tx.outboxEvent.count.mockResolvedValue(0);
    tx.privacyRequest.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'request', ...data }));
  });

  it('anonymizes linked records, revokes access, deletes the user and records the audit trail', async () => {
    const completed = await eraseGuestByAdmin(USER_ID, 'Guest asked by email');

    expect(prismaMock.privacyRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: USER_ID,
      requestType: 'ERASURE',
      status: 'VERIFIED',
      auditNote: 'Guest asked by email',
    }) });
    expect(tx.stayRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ firstName: 'Erased', phone: '+999000000000', specialRequests: null, status: 'CLOSED' }),
    }));
    expect(tx.bookingClaimGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { bookingId: { in: [BOOKING_ID] }, revokedAt: null },
    }));
    expect(tx.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: null, accessStatus: 'PENDING' }),
    }));
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
    const audit = tx.securityAuditEvent.create.mock.calls[0][0] as { data: { eventType: string } };
    expect(audit.data.eventType).toBe('privacy.erasure.completed');
    expect(JSON.stringify(audit)).not.toContain(USER_ID);
    expect(completed).toMatchObject({ status: 'COMPLETED' });
  });

  it('refuses an unknown guest before creating a privacy request', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(eraseGuestByAdmin(USER_ID, 'reason')).rejects.toThrow('ERASURE_SUBJECT_NOT_FOUND');
    expect(prismaMock.privacyRequest.create).not.toHaveBeenCalled();
  });

  it('refuses while a related webhook delivery is leased', async () => {
    tx.outboxEvent.count.mockResolvedValue(1);

    await expect(eraseGuestByAdmin(USER_ID, 'reason')).rejects.toThrow('ERASURE_BLOCKED_BY_ACTIVE_DELIVERY');
    expect(tx.user.delete).not.toHaveBeenCalled();
  });
});
