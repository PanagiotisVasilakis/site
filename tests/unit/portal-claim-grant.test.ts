import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => {
  const tx = {
    booking: { updateMany: vi.fn() },
    bookingClaimGrant: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    termsAcceptance: { upsert: vi.fn() },
    securityAuditEvent: { create: vi.fn() },
  };
  return { tx, $transaction: vi.fn() };
});

// Real bcrypt at cost 12 takes about 0.25 s per hash; the integration suite
// (tests/integration/auth/claim-lifecycle-characterization.test.ts) keeps the real one.
const bcryptMock = vi.hoisted(() => ({ hash: vi.fn(), compare: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('bcrypt', () => ({ default: { hash: bcryptMock.hash, compare: bcryptMock.compare } }));

import { consumeBookingClaimGrant, PortalAuthError } from '@/lib/portalAuthService';

type Row = Record<string, unknown>;

const NOW = new Date('2030-07-10T15:00:00.000Z');
const day = (offset: number) => new Date(Date.UTC(2030, 6, 10 + offset));
const GRANT_ID = '6c0f1d7e-3f7a-4c55-9a51-0c3e8f4f2a01';
const BOOKING_ID = '6c0f1d7e-3f7a-4c55-9a51-0c3e8f4f2a02';
const USER_ID = '6c0f1d7e-3f7a-4c55-9a51-0c3e8f4f2a03';
const TOKEN_DIGEST = 'a'.repeat(64);
const PHONE = '+12025550401';
const PASSWORD = 'a-new-password-1234';
const STORED_HASH = `$2b$12$${'s'.repeat(53)}`;

// An open grant for an unclaimed booking whose stay is under way.
function grant(overrides: Row = {}, booking: Row = {}) {
  return {
    id: GRANT_ID,
    bookingId: BOOKING_ID,
    channel: 'ONSITE',
    consumedAt: null,
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + 30 * 60_000),
    booking: {
      id: BOOKING_ID,
      userId: null,
      accessStatus: 'PENDING',
      startDate: day(-1),
      endDate: day(3),
      ...booking,
    },
    ...overrides,
  };
}

function claim(phone = PHONE) {
  return consumeBookingClaimGrant({
    tokenDigest: TOKEN_DIGEST,
    phone,
    origin: 'ABROAD',
    password: PASSWORD,
    correlationId: 'corr-claim-1',
    ipHash: 'h'.repeat(64),
  });
}

function expectNothingWritten() {
  const { tx } = prismaMock;
  expect(tx.user.create).not.toHaveBeenCalled();
  expect(tx.user.update).not.toHaveBeenCalled();
  expect(tx.bookingClaimGrant.updateMany).not.toHaveBeenCalled();
  expect(tx.booking.updateMany).not.toHaveBeenCalled();
  expect(tx.termsAcceptance.upsert).not.toHaveBeenCalled();
  expect(tx.securityAuditEvent.create).not.toHaveBeenCalled();
}

describe('consuming a booking claim grant', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { tx } = prismaMock;
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    tx.bookingClaimGrant.findUnique.mockResolvedValue(grant());
    tx.bookingClaimGrant.updateMany.mockResolvedValue({ count: 1 });
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.user.findUnique.mockResolvedValue(null);
    bcryptMock.hash.mockImplementation(async (_password: string, rounds: number) => `$2b$${rounds}$${'x'.repeat(53)}`);
  });
  afterEach(() => vi.useRealTimers());

  it('creates the account, consumes the grant and claims the booking in one serializable transaction', async () => {
    const { tx } = prismaMock;

    const result = await claim();

    expect(result).toEqual({ userId: expect.any(String), bookingId: BOOKING_ID });
    expect(prismaMock.$transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: { id: result.userId, phoneE164: PHONE, passwordHash: expect.stringMatching(/^\$2[aby]\$12\$/u) },
    });
    // Only an open, unexpired grant can be consumed, and only once.
    expect(tx.bookingClaimGrant.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: GRANT_ID, consumedAt: null, revokedAt: null, expiresAt: { gt: NOW } },
      data: { consumedAt: NOW },
    });
    expect(tx.booking.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: BOOKING_ID, OR: [{ userId: null }, { userId: result.userId }] },
      data: { userId: result.userId, accessStatus: 'VERIFIED', claimedAt: NOW },
    });
    // Every other open grant of the booking is revoked.
    expect(tx.bookingClaimGrant.updateMany).toHaveBeenNthCalledWith(2, {
      where: { bookingId: BOOKING_ID, id: { not: GRANT_ID }, consumedAt: null, revokedAt: null },
      data: { revokedAt: NOW },
    });
    expect(tx.termsAcceptance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { bookingId_userId_termsVersion: { bookingId: BOOKING_ID, userId: result.userId, termsVersion: expect.any(String) } },
    }));
    expect(tx.securityAuditEvent.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        id: expect.any(String),
        eventType: 'portal.booking_claimed',
        severity: 'low',
        correlationId: 'corr-claim-1',
        ipHash: 'h'.repeat(64),
        path: '/api/portal/claims',
        details: { bookingId: BOOKING_ID, channel: 'ONSITE' },
      },
    });
    expect(JSON.stringify(tx.securityAuditEvent.create.mock.calls)).not.toContain(PHONE);
  });

  it.each([
    ['an unknown token', null],
    ['an expired grant', grant({ expiresAt: new Date(NOW.getTime() - 1) })],
    ['a grant that expires at this very instant', grant({ expiresAt: NOW })],
    ['an already consumed grant', grant({ consumedAt: new Date(NOW.getTime() - 60_000) })],
    ['a revoked grant', grant({ revokedAt: new Date(NOW.getTime() - 60_000) })],
    ['a stay that ended yesterday', grant({}, { startDate: day(-4), endDate: day(-1) })],
    ['a check-in more than 7 days away', grant({}, { startDate: day(8), endDate: day(12) })],
  ] as const)('refuses %s without writing anything', async (_label, found) => {
    prismaMock.tx.bookingClaimGrant.findUnique.mockResolvedValue(found);

    await expect(claim()).rejects.toMatchObject({ name: 'PortalAuthError', code: 'INVALID_CLAIM' });

    expectNothingWritten();
    expect(bcryptMock.compare).not.toHaveBeenCalled();
  });

  it.each([
    ['on the last day of the stay', { startDate: day(-3), endDate: day(0) }],
    ['exactly 7 days before check-in', { startDate: day(7), endDate: day(10) }],
  ])('still accepts a grant %s', async (_label, booking) => {
    prismaMock.tx.bookingClaimGrant.findUnique.mockResolvedValue(grant({}, booking));

    await expect(claim()).resolves.toMatchObject({ bookingId: BOOKING_ID });
  });

  it.each([0, 2])('refuses the claim when consuming the grant updates %i rows, so a lost race cannot claim the booking', async (count) => {
    const { tx } = prismaMock;
    tx.bookingClaimGrant.updateMany.mockResolvedValue({ count });

    await expect(claim()).rejects.toMatchObject({ name: 'PortalAuthError', code: 'INVALID_CLAIM' });

    expect(tx.bookingClaimGrant.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(tx.termsAcceptance.upsert).not.toHaveBeenCalled();
    expect(tx.securityAuditEvent.create).not.toHaveBeenCalled();
  });

  it('answers BOOKING_ALREADY_CLAIMED when the booking was claimed by someone else in the meantime', async () => {
    const { tx } = prismaMock;
    tx.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(claim()).rejects.toMatchObject({ name: 'PortalAuthError', code: 'BOOKING_ALREADY_CLAIMED' });

    // The rejection rolls the transaction back; nothing after the failed claim runs.
    expect(tx.bookingClaimGrant.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.termsAcceptance.upsert).not.toHaveBeenCalled();
    expect(tx.securityAuditEvent.create).not.toHaveBeenCalled();
  });

  it('lets a returning guest claim another booking with the account password', async () => {
    const { tx } = prismaMock;
    tx.user.findUnique.mockResolvedValue({ id: USER_ID, phoneE164: PHONE, passwordHash: STORED_HASH });
    bcryptMock.compare.mockResolvedValue(true);

    await expect(claim()).resolves.toEqual({ userId: USER_ID, bookingId: BOOKING_ID });

    expect(bcryptMock.compare).toHaveBeenCalledExactlyOnceWith(PASSWORD, STORED_HASH);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { userId: USER_ID, accessStatus: 'VERIFIED', claimedAt: NOW },
    }));
  });

  it('refuses a wrong password for an existing account without consuming the grant', async () => {
    const { tx } = prismaMock;
    tx.user.findUnique.mockResolvedValue({ id: USER_ID, phoneE164: PHONE, passwordHash: STORED_HASH });
    bcryptMock.compare.mockResolvedValue(false);

    await expect(claim()).rejects.toMatchObject({ name: 'PortalAuthError', code: 'INVALID_CREDENTIALS' });

    expectNothingWritten();
  });

  it.each([
    ['an unreadable phone number', 'not-a-phone', TOKEN_DIGEST],
    ['a token digest of the wrong shape', PHONE, 'A'.repeat(64)],
    ['a token digest that is too short', PHONE, 'a'.repeat(63)],
  ])('refuses %s before hashing the password or opening a transaction', async (_label, phone, tokenDigest) => {
    await expect(consumeBookingClaimGrant({ tokenDigest, phone, origin: 'ABROAD', password: PASSWORD }))
      .rejects.toEqual(new PortalAuthError('INVALID_CLAIM'));

    expect(bcryptMock.hash).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  describe('serialization conflicts', () => {
    const conflict = () => Object.assign(new Error('could not serialize access'), { code: 'P2034' });

    it('retries the whole claim and hashes the password once', async () => {
      const { tx } = prismaMock;
      prismaMock.$transaction
        .mockRejectedValueOnce(conflict())
        .mockRejectedValueOnce(conflict())
        .mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));

      await expect(claim()).resolves.toMatchObject({ bookingId: BOOKING_ID });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
      expect(bcryptMock.hash).toHaveBeenCalledTimes(1);
    });

    it('gives up after three attempts and reports the conflict', async () => {
      const failure = conflict();
      prismaMock.$transaction.mockRejectedValue(failure);

      await expect(claim()).rejects.toBe(failure);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
    });

    it('does not retry any other failure', async () => {
      const failure = new Error('connection terminated');
      prismaMock.$transaction.mockRejectedValue(failure);

      await expect(claim()).rejects.toBe(failure);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
