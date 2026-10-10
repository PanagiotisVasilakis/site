import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => {
  const model = () => ({ deleteMany: vi.fn((args: unknown) => ({ args })) });
  return {
    checkInRequest: { updateMany: vi.fn((args: unknown) => ({ args })) },
    user: { findMany: vi.fn() },
    rateLimit: model(),
    session: model(),
    refreshToken: model(),
    refreshTokenFamily: model(),
    bookingClaimGrant: model(),
    securityAuditEvent: model(),
    outboxEvent: model(),
    adminSession: model(),
    $transaction: vi.fn(async (operations: unknown[]) => operations.map((_, index) => ({ count: index }))),
  };
});

const privacyMock = vi.hoisted(() => ({ eraseGuestForRetention: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/privacyService', () => privacyMock);

import { runRetention } from '@/lib/operationalMonitor';

beforeEach(() => {
  prismaMock.user.findMany.mockResolvedValue([]);
  privacyMock.eraseGuestForRetention.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('operational retention', () => {
  it('removes administrator sessions 90 days after their absolute expiry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    const result = await runRetention();

    expect(prismaMock.adminSession.deleteMany).toHaveBeenCalledWith({
      where: { absoluteExpiresAt: { lt: new Date('2030-04-15T00:00:00Z') } },
    });
    // The mocked transaction reports each operation's position as its count.
    expect(result.adminSessions).toBe(8);
  });

  it('removes erasure-cancelled DEAD events at once and other DEAD events after 30 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    const result = await runRetention();

    expect(prismaMock.outboxEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: 'DEAD', payload: { path: ['redacted'], equals: true } },
          { status: 'DEAD', updatedAt: { lt: new Date('2030-06-14T00:00:00Z') } },
        ],
      },
    });
    expect(result.deadOutbox).toBe(7);
  });

  it('removes every claim grant 30 days after expiry, including never-used ones', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    const result = await runRetention();

    expect(prismaMock.bookingClaimGrant.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.bookingClaimGrant.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date('2030-06-14T00:00:00Z') } },
    });
    expect(result.grants).toBe(4);
  });

  it('removes expired limiter counters, sessions, refresh tokens, refresh families and security events after the published periods', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    await runRetention();

    expect(prismaMock.rateLimit.deleteMany).toHaveBeenCalledWith({ where: { resetTime: { lt: new Date('2030-07-14T00:00:00Z') } } });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: new Date('2030-07-07T00:00:00Z') } } });
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: new Date('2030-06-14T00:00:00Z') } } });
    expect(prismaMock.refreshTokenFamily.deleteMany).toHaveBeenCalledWith({ where: { absoluteExpiresAt: { lt: new Date('2030-06-14T00:00:00Z') } } });
    expect(prismaMock.securityAuditEvent.deleteMany).toHaveBeenCalledWith({ where: { occurredAt: { lt: new Date('2030-04-15T00:00:00Z') } } });
    expect(prismaMock.outboxEvent.deleteMany).toHaveBeenCalledWith({ where: { status: 'DELIVERED', deliveredAt: { lt: new Date('2030-06-14T00:00:00Z') } } });
  });

  it('redacts check-in request contact data 12 months after the booking ended', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    const result = await runRetention();

    expect(prismaMock.checkInRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.checkInRequest.updateMany).toHaveBeenCalledWith({
      where: {
        booking: { endDate: { lt: new Date('2029-07-14T00:00:00Z') } },
        OR: [
          { guestName: { not: null } },
          { guestEmail: { not: null } },
          { guestPhone: { not: null } },
          { message: { not: null } },
        ],
      },
      data: { guestName: null, guestEmail: null, guestPhone: null, message: null },
    });
    // Appended after the existing operations, so their positions are unchanged.
    expect(result.checkInRequestsRedacted).toBe(9);
    expect(result.adminSessions).toBe(8);
  });

  it('erases, through the audited erasure path, guests whose every booking ended 12 months ago', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);

    const result = await runRetention();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { bookings: { some: {}, every: { endDate: { lt: new Date('2029-07-14T00:00:00Z') } } } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });
    const note = 'Automatic retention: every booking of this guest ended more than 12 months ago.';
    const cutoff = new Date('2029-07-14T00:00:00Z');
    expect(privacyMock.eraseGuestForRetention.mock.calls).toEqual([
      ['user-1', note, cutoff],
      ['user-2', note, cutoff],
    ]);
    expect(result.guestsErased).toBe(2);
    expect(result.guestErasuresSkipped).toBe(0);
  });

  it('counts a guest the erasure skipped (new booking claimed meanwhile) separately and does not fail', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);
    privacyMock.eraseGuestForRetention.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await runRetention();

    expect(result.guestsErased).toBe(1);
    expect(result.guestErasuresSkipped).toBe(1);
  });

  it('attempts every guest in the batch and then fails the run when an erasure fails', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);
    privacyMock.eraseGuestForRetention
      .mockRejectedValueOnce(new Error('ERASURE_BLOCKED_BY_ACTIVE_DELIVERY'))
      .mockResolvedValueOnce(true);

    await expect(runRetention()).rejects.toThrow(
      '1 retention guest erasure(s) failed: ERASURE_BLOCKED_BY_ACTIVE_DELIVERY',
    );
    expect(privacyMock.eraseGuestForRetention).toHaveBeenCalledTimes(2);
  });
});
