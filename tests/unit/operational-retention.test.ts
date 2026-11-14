import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => {
  const model = () => ({ deleteMany: vi.fn() });
  return {
    checkInRequest: { updateMany: vi.fn() },
    user: { findMany: vi.fn() },
    rateLimit: model(),
    session: model(),
    refreshToken: model(),
    refreshTokenFamily: model(),
    bookingClaimGrant: model(),
    securityAuditEvent: { ...model(), createMany: vi.fn() },
    outboxEvent: model(),
    adminSession: model(),
  };
});

const privacyMock = vi.hoisted(() => ({ eraseGuestForRetention: vi.fn() }));
const loggerMock = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/privacyService', () => privacyMock);
vi.mock('@/lib/logger-enterprise', () => ({ logger: loggerMock }));

import { runRetention } from '@/lib/operationalMonitor';

// Each step reports its own count, so a result can be traced back to the step that produced it.
beforeEach(() => {
  prismaMock.rateLimit.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.session.deleteMany.mockResolvedValue({ count: 2 });
  prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 3 });
  prismaMock.refreshTokenFamily.deleteMany.mockResolvedValue({ count: 4 });
  prismaMock.bookingClaimGrant.deleteMany.mockResolvedValue({ count: 5 });
  prismaMock.securityAuditEvent.deleteMany.mockResolvedValue({ count: 6 });
  prismaMock.outboxEvent.deleteMany.mockResolvedValueOnce({ count: 7 }).mockResolvedValueOnce({ count: 8 });
  prismaMock.adminSession.deleteMany.mockResolvedValue({ count: 9 });
  prismaMock.checkInRequest.updateMany.mockResolvedValueOnce({ count: 10 }).mockResolvedValueOnce({ count: 11 });
  prismaMock.securityAuditEvent.createMany.mockResolvedValue({ count: 1 });
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
    expect(result.adminSessions).toBe(9);
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
    expect(result.deadOutbox).toBe(8);
  });

  it('removes every claim grant 30 days after expiry, including never-used ones', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    const result = await runRetention();

    expect(prismaMock.bookingClaimGrant.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.bookingClaimGrant.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date('2030-06-14T00:00:00Z') } },
    });
    expect(result.grants).toBe(5);
  });

  it('removes expired limiter counters, sessions, refresh tokens, refresh families and security events after the published periods', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    await runRetention();

    expect(prismaMock.rateLimit.deleteMany).toHaveBeenCalledWith({ where: { resetTime: { lt: new Date('2030-07-14T00:00:00Z') } } });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: new Date('2030-07-07T00:00:00Z') } } });
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: new Date('2030-06-14T00:00:00Z') } } });
    expect(prismaMock.refreshTokenFamily.deleteMany).toHaveBeenCalledWith({ where: { absoluteExpiresAt: { lt: new Date('2030-06-14T00:00:00Z') } } });
    expect(prismaMock.securityAuditEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { occurredAt: { lt: new Date('2030-04-15T00:00:00Z') } },
          { eventType: { in: ['client.error', 'csp_violation'] }, occurredAt: { lt: new Date('2030-06-30T00:00:00Z') } },
        ],
      },
    });
    expect(prismaMock.outboxEvent.deleteMany).toHaveBeenCalledWith({ where: { status: 'DELIVERED', deliveredAt: { lt: new Date('2030-06-14T00:00:00Z') } } });
  });

  it('removes unauthenticated client error and CSP reports after 14 days and every other security event after 90 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    const result = await runRetention();

    // One delete: the 14-day rule names exactly the two report types, so audit events of
    // every other type (sign-in, privacy, erasure) are only reached by the 90-day branch.
    expect(prismaMock.securityAuditEvent.deleteMany).toHaveBeenCalledTimes(1);
    const { where } = prismaMock.securityAuditEvent.deleteMany.mock.calls[0][0] as {
      where: { OR: Array<{ eventType?: { in: string[] }; occurredAt: { lt: Date } }> };
    };
    const [general, reports] = where.OR;
    expect(general).toEqual({ occurredAt: { lt: new Date('2030-04-15T00:00:00Z') } });
    expect(general).not.toHaveProperty('eventType');
    expect(reports.eventType).toEqual({ in: ['client.error', 'csp_violation'] });
    expect(reports.occurredAt.lt).toEqual(new Date('2030-06-30T00:00:00Z'));
    expect(result.securityEvents).toBe(6);
  });

  it('redacts check-in request contact data 12 months after the booking ended', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    const result = await runRetention();

    expect(prismaMock.checkInRequest.updateMany).toHaveBeenNthCalledWith(1, {
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
    expect(result.checkInRequestsRedacted).toBe(10);
  });

  it('redacts the contact data of a check-in request without a booking 12 months after it was created', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T00:00:00Z'));

    const result = await runRetention();

    // The same four fields as the booked rows lose. A booking-less row has no end date, so its
    // creation time is the reference; rows with a booking are left to the booking-based step.
    expect(prismaMock.checkInRequest.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.checkInRequest.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        bookingId: null,
        createdAt: { lt: new Date('2029-07-14T00:00:00Z') },
        OR: [
          { guestName: { not: null } },
          { guestEmail: { not: null } },
          { guestPhone: { not: null } },
          { message: { not: null } },
        ],
      },
      data: { guestName: null, guestEmail: null, guestPhone: null, message: null },
    });
    expect(result.bookinglessCheckInRequestsRedacted).toBe(11);
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

  it('returns every count and records nothing when all steps succeed', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1' }]);

    await expect(runRetention()).resolves.toEqual({
      rateLimits: 1,
      sessions: 2,
      tokens: 3,
      families: 4,
      grants: 5,
      securityEvents: 6,
      outbox: 7,
      deadOutbox: 8,
      adminSessions: 9,
      checkInRequestsRedacted: 10,
      bookinglessCheckInRequestsRedacted: 11,
      guestsErased: 1,
      guestErasuresSkipped: 0,
    });
    expect(prismaMock.securityAuditEvent.createMany).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});

describe('operational retention step isolation', () => {
  // Every step with the way to make it fail once; the outbox and check-in steps are two calls of one model.
  const STEPS: Array<[step: string, fail: (error: Error) => void]> = [
    ['rateLimits', (error) => { prismaMock.rateLimit.deleteMany.mockRejectedValue(error); }],
    ['sessions', (error) => { prismaMock.session.deleteMany.mockRejectedValue(error); }],
    ['tokens', (error) => { prismaMock.refreshToken.deleteMany.mockRejectedValue(error); }],
    ['families', (error) => { prismaMock.refreshTokenFamily.deleteMany.mockRejectedValue(error); }],
    ['grants', (error) => { prismaMock.bookingClaimGrant.deleteMany.mockRejectedValue(error); }],
    ['securityEvents', (error) => { prismaMock.securityAuditEvent.deleteMany.mockRejectedValue(error); }],
    ['outbox', (error) => {
      prismaMock.outboxEvent.deleteMany.mockReset();
      prismaMock.outboxEvent.deleteMany.mockRejectedValueOnce(error).mockResolvedValueOnce({ count: 8 });
    }],
    ['deadOutbox', (error) => {
      prismaMock.outboxEvent.deleteMany.mockReset();
      prismaMock.outboxEvent.deleteMany.mockResolvedValueOnce({ count: 7 }).mockRejectedValueOnce(error);
    }],
    ['adminSessions', (error) => { prismaMock.adminSession.deleteMany.mockRejectedValue(error); }],
    ['checkInRequestsRedacted', (error) => {
      prismaMock.checkInRequest.updateMany.mockReset();
      prismaMock.checkInRequest.updateMany.mockRejectedValueOnce(error).mockResolvedValueOnce({ count: 11 });
    }],
    ['bookinglessCheckInRequestsRedacted', (error) => {
      prismaMock.checkInRequest.updateMany.mockReset();
      prismaMock.checkInRequest.updateMany.mockResolvedValueOnce({ count: 10 }).mockRejectedValueOnce(error);
    }],
    ['guestErasure', (error) => { prismaMock.user.findMany.mockRejectedValue(error); }],
  ];

  function expectEveryStepAttempted() {
    expect(prismaMock.rateLimit.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.session.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.refreshTokenFamily.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.bookingClaimGrant.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.securityAuditEvent.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.outboxEvent.deleteMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.adminSession.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.checkInRequest.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
  }

  it.each(STEPS)('runs every other step, records the failure and fails the run when %s fails', async (step, fail) => {
    fail(new Error('relation is locked'));

    await expect(runRetention()).rejects.toThrow(`1 retention step(s) failed: ${step}: relation is locked`);

    expectEveryStepAttempted();
    expect(prismaMock.securityAuditEvent.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.securityAuditEvent.createMany).toHaveBeenCalledWith({
      data: [{
        id: expect.any(String),
        eventType: 'operations.retention_step_failed',
        severity: 'high',
        details: { step, error: 'Error' },
      }],
    });
    expect(loggerMock.error).toHaveBeenCalledWith('Retention step failed', { step, error: 'Error' });
  });

  it('still redacts check-in requests and erases guests while a housekeeping delete keeps failing', async () => {
    prismaMock.rateLimit.deleteMany.mockRejectedValue(new Error('deadlock detected'));
    prismaMock.securityAuditEvent.deleteMany.mockRejectedValue(new Error('canceling statement due to statement timeout'));
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);

    await expect(runRetention()).rejects.toThrow(
      '2 retention step(s) failed: rateLimits: deadlock detected; securityEvents: canceling statement due to statement timeout',
    );

    expect(prismaMock.checkInRequest.updateMany).toHaveBeenCalledTimes(2);
    expect(privacyMock.eraseGuestForRetention.mock.calls.map(([id]) => id)).toEqual(['user-1', 'user-2']);
    // One statement records both failures.
    expect(prismaMock.securityAuditEvent.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.securityAuditEvent.createMany.mock.calls[0][0].data.map((row: { details: unknown }) => row.details))
      .toEqual([{ step: 'rateLimits', error: 'Error' }, { step: 'securityEvents', error: 'Error' }]);
  });

  it('reports a failed guest erasure, keeps the counts of the erasures that worked and still runs the other steps', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);
    privacyMock.eraseGuestForRetention
      .mockRejectedValueOnce(new Error('ERASURE_BLOCKED_BY_ACTIVE_DELIVERY'))
      .mockResolvedValueOnce(true);

    await expect(runRetention()).rejects.toThrow(
      '1 retention step(s) failed: guestErasure: 1 retention guest erasure(s) failed: ERASURE_BLOCKED_BY_ACTIVE_DELIVERY',
    );

    expect(privacyMock.eraseGuestForRetention).toHaveBeenCalledTimes(2);
    expect(prismaMock.checkInRequest.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.securityAuditEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ details: { step: 'guestErasure', error: 'AggregateError' } })],
    });
  });

  it('exposes the failures of the steps as the errors of the thrown AggregateError', async () => {
    const first = new Error('first');
    const second = new Error('second');
    prismaMock.session.deleteMany.mockRejectedValue(first);
    prismaMock.adminSession.deleteMany.mockRejectedValue(second);

    const failure = await runRetention().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([first, second]);
  });

  it('records the code of a database error, never its message', async () => {
    const databaseError = Object.assign(
      new Error('Unique constraint failed on guest_phone = +306900000001'),
      { code: 'P2002' },
    );
    prismaMock.checkInRequest.updateMany.mockReset();
    prismaMock.checkInRequest.updateMany.mockRejectedValueOnce(databaseError).mockResolvedValueOnce({ count: 11 });

    await expect(runRetention()).rejects.toThrow('checkInRequestsRedacted');

    const recorded = JSON.stringify([
      prismaMock.securityAuditEvent.createMany.mock.calls,
      loggerMock.error.mock.calls,
    ]);
    expect(recorded).toContain('P2002');
    expect(recorded).not.toContain('+306900000001');
    expect(recorded).not.toContain('Unique constraint');
  });

  it('still fails the run with the original errors when the failure cannot be recorded', async () => {
    prismaMock.session.deleteMany.mockRejectedValue(new Error('connection terminated'));
    prismaMock.securityAuditEvent.createMany.mockRejectedValue(new Error('connection terminated'));

    await expect(runRetention()).rejects.toThrow('1 retention step(s) failed: sessions: connection terminated');

    expect(loggerMock.error).toHaveBeenCalledWith('Could not record the retention failures', { error: 'Error' });
  });

  it('treats a non-Error rejection as a failed step', async () => {
    prismaMock.rateLimit.deleteMany.mockRejectedValue('plain string');

    await expect(runRetention()).rejects.toThrow('1 retention step(s) failed: rateLimits: plain string');
  });
});
