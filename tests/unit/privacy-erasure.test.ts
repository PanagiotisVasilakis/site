import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '4c939e37-ef9f-4fb2-8231-319896c89080';
const BOOKING_ID = 'c6a502d6-6dd2-4a03-811e-694114f3122a';

const tx = vi.hoisted(() => ({
  privacyRequest: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  user: { findUnique: vi.fn(), delete: vi.fn() },
  checkInRequest: { findMany: vi.fn(), updateMany: vi.fn() },
  outboxEvent: { count: vi.fn(), updateMany: vi.fn() },
  bookingClaimGrant: { updateMany: vi.fn() },
  booking: { updateMany: vi.fn() },
  securityAuditEvent: { create: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  privacyRequest: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { eraseGuestByAdmin, eraseGuestForRetention } from '@/lib/privacyService';

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
      bookings: [{ id: BOOKING_ID }],
    });
    tx.checkInRequest.findMany.mockResolvedValue([{ id: 'check-in-1' }]);
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
    expect(tx.outboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { checkInRequestId: { in: ['check-in-1'] }, status: { in: ['PENDING', 'LEASED'] } },
      data: expect.objectContaining({ payload: { redacted: true, reason: 'privacy_erasure' }, status: 'DEAD' }),
    }));
    expect(tx.checkInRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { userId: null, guestName: null, guestEmail: null, guestPhone: null, message: null },
    }));
    expect(tx.bookingClaimGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { bookingId: { in: [BOOKING_ID] }, revokedAt: null },
    }));
    // R-195 (a): externalReference is kept, so it must not appear in the erasure update.
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [BOOKING_ID] } },
      data: { userId: null, accessStatus: 'PENDING', claimedAt: null },
    });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
    const audit = tx.securityAuditEvent.create.mock.calls[0][0] as { data: { eventType: string } };
    expect(audit.data.eventType).toBe('privacy.erasure.completed');
    expect(JSON.stringify(audit)).not.toContain(USER_ID);
    expect(completed).toMatchObject({ status: 'COMPLETED' });
  });

  it('upgrades a legacy PENDING erasure request to VERIFIED and completes it', async () => {
    let storedStatus = 'PENDING';
    prismaMock.privacyRequest.findFirst.mockResolvedValue({
      id: 'legacy-request',
      requestType: 'ERASURE',
      status: 'PENDING',
      userId: USER_ID,
    });
    prismaMock.privacyRequest.updateMany.mockImplementation(async ({ where, data }: { where: { status: string }; data: { status: string } }) => {
      if (storedStatus !== where.status) return { count: 0 };
      storedStatus = data.status;
      return { count: 1 };
    });
    tx.privacyRequest.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      requestType: 'ERASURE',
      status: storedStatus,
      userId: USER_ID,
      subjectDigest: 'digest',
    }));

    const completed = await eraseGuestByAdmin(USER_ID, 'Guest asked by email');

    expect(prismaMock.privacyRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'legacy-request', status: 'PENDING' },
      data: { status: 'VERIFIED', auditNote: 'Guest asked by email' },
    });
    expect(prismaMock.privacyRequest.create).not.toHaveBeenCalled();
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
    expect(completed).toMatchObject({ status: 'COMPLETED' });
  });

  it('does not revert a legacy request that a concurrent call already completed', async () => {
    prismaMock.privacyRequest.findFirst.mockResolvedValue({
      id: 'legacy-request',
      requestType: 'ERASURE',
      status: 'PENDING',
      userId: USER_ID,
    });
    prismaMock.privacyRequest.updateMany.mockResolvedValue({ count: 0 });
    const completedRow = {
      id: 'legacy-request',
      requestType: 'ERASURE',
      status: 'COMPLETED',
      userId: null,
      subjectDigest: 'digest',
    };
    tx.privacyRequest.findUnique.mockResolvedValue(completedRow);

    const result = await eraseGuestByAdmin(USER_ID, 'Second click');

    expect(prismaMock.privacyRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'legacy-request', status: 'PENDING' },
      data: { status: 'VERIFIED', auditNote: 'Second click' },
    });
    expect(result).toBe(completedRow);
    expect(tx.user.delete).not.toHaveBeenCalled();
    expect(tx.privacyRequest.update).not.toHaveBeenCalled();
  });

  it('refuses an unknown guest before creating a privacy request', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(eraseGuestByAdmin(USER_ID, 'reason')).rejects.toThrow('ERASURE_SUBJECT_NOT_FOUND');
    expect(prismaMock.privacyRequest.create).not.toHaveBeenCalled();
  });

  it('refuses while a related check-in webhook delivery is leased', async () => {
    tx.outboxEvent.count.mockResolvedValue(1);

    await expect(eraseGuestByAdmin(USER_ID, 'reason')).rejects.toThrow('ERASURE_BLOCKED_BY_ACTIVE_DELIVERY');
    expect(tx.outboxEvent.count).toHaveBeenCalledWith({
      where: { status: 'LEASED', leaseExpiresAt: { gt: expect.any(Date) }, checkInRequestId: { in: ['check-in-1'] } },
    });
    expect(tx.outboxEvent.updateMany).not.toHaveBeenCalled();
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  describe('automatic retention', () => {
    const CUTOFF = new Date('2029-07-14T00:00:00Z');
    const NOTE = 'Automatic retention';

    it('erases when every booking still ended before the cutoff inside the transaction', async () => {
      tx.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bookings: [{ id: BOOKING_ID, endDate: new Date('2029-07-13T00:00:00Z') }],
      });

      await expect(eraseGuestForRetention(USER_ID, NOTE, CUTOFF)).resolves.toBe(true);

      expect(tx.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: { id: true, bookings: { select: { id: true, endDate: true } } },
      });
      expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
      expect(tx.privacyRequest.delete).not.toHaveBeenCalled();
    });

    it('skips, erasing nothing, when the transaction sees a booking claimed after the selection', async () => {
      tx.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bookings: [
          { id: BOOKING_ID, endDate: new Date('2029-07-13T00:00:00Z') },
          { id: 'recent-booking', endDate: new Date('2030-07-20T00:00:00Z') },
        ],
      });

      await expect(eraseGuestForRetention(USER_ID, NOTE, CUTOFF)).resolves.toBe(false);

      const createdId = (prismaMock.privacyRequest.create.mock.calls[0][0] as { data: { id: string } }).data.id;
      expect(tx.privacyRequest.delete).toHaveBeenCalledWith({ where: { id: createdId } });
      expect(tx.checkInRequest.findMany).not.toHaveBeenCalled();
      expect(tx.checkInRequest.updateMany).not.toHaveBeenCalled();
      expect(tx.outboxEvent.updateMany).not.toHaveBeenCalled();
      expect(tx.bookingClaimGrant.updateMany).not.toHaveBeenCalled();
      expect(tx.booking.updateMany).not.toHaveBeenCalled();
      expect(tx.user.delete).not.toHaveBeenCalled();
      expect(tx.privacyRequest.update).not.toHaveBeenCalled();
      expect(tx.securityAuditEvent.create).not.toHaveBeenCalled();
    });

    it('keeps a request it did not create when it skips', async () => {
      prismaMock.privacyRequest.findFirst.mockResolvedValue({
        id: 'admin-request',
        requestType: 'ERASURE',
        status: 'VERIFIED',
        userId: USER_ID,
      });
      tx.user.findUnique.mockResolvedValue({
        id: USER_ID,
        bookings: [{ id: BOOKING_ID, endDate: new Date('2030-07-20T00:00:00Z') }],
      });

      await expect(eraseGuestForRetention(USER_ID, NOTE, CUTOFF)).resolves.toBe(false);

      expect(tx.privacyRequest.delete).not.toHaveBeenCalled();
      expect(tx.user.delete).not.toHaveBeenCalled();
    });

    it('skips a guest already erased before the run reached it', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(eraseGuestForRetention(USER_ID, NOTE, CUTOFF)).resolves.toBe(false);

      expect(prismaMock.privacyRequest.create).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });
});
