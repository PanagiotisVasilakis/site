import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => {
  const tx = {
    booking: { findUnique: vi.fn(), updateMany: vi.fn() },
    bookingClaimGrant: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    refreshTokenFamily: { updateMany: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    session: { updateMany: vi.fn() },
    termsAcceptance: { upsert: vi.fn() },
    securityAuditEvent: { create: vi.fn() },
  };
  return { tx, $transaction: vi.fn() };
});

// Real bcrypt at cost 12 takes about 0.25 s per hash; the integration suite
// (tests/integration/auth/guest-access-reset.test.ts) keeps the real one.
const bcryptMock = vi.hoisted(() => ({ hash: vi.fn(), compare: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('bcrypt', () => ({ default: { hash: bcryptMock.hash, compare: bcryptMock.compare } }));

import { consumeBookingClaimGrant, PortalAuthError, resetGuestAccess } from '@/lib/portalAuthService';

const NOW = new Date('2030-07-10T15:00:00.000Z');
const day = (offset: number) => new Date(Date.UTC(2030, 6, 10 + offset));
const BOOKING_ID = '5b0f1d7e-3f7a-4c55-9a51-0c3e8f4f2a11';
const OTHER_BOOKING_ID = '5b0f1d7e-3f7a-4c55-9a51-0c3e8f4f2a12';
const USER_ID = '7d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a';
const ADMIN_SESSION_ID = '0f8d6a55-2f5e-4c43-9a5e-1d6d0f3f9b11';
const PHONE = '+12025550401';

function claimedBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    userId: USER_ID,
    accessStatus: 'VERIFIED',
    startDate: day(-1),
    endDate: day(3),
    ...overrides,
  };
}

describe('host access reset', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('CLAIM_TOKEN_PEPPER', 'guest-access-reset-test-pepper-0123456789');
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof prismaMock.tx) => unknown) => callback(prismaMock.tx));
    prismaMock.tx.booking.findUnique.mockResolvedValue(claimedBooking());
    prismaMock.tx.bookingClaimGrant.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.tx.bookingClaimGrant.create.mockResolvedValue({});
    prismaMock.tx.refreshTokenFamily.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.tx.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.tx.session.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => vi.useRealTimers());

  it('clears the password, revokes every credential of the guest and issues a remote grant', async () => {
    const grant = await resetGuestAccess({ bookingId: BOOKING_ID, adminSessionId: ADMIN_SESSION_ID });

    expect(grant.token).toMatch(/^claim_[A-Za-z0-9_-]{43}$/u);
    expect(grant.expiresAt).toEqual(new Date(NOW.getTime() + 30 * 60_000));
    const { tx } = prismaMock;
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: USER_ID }, data: { passwordHash: null } });
    expect(tx.refreshTokenFamily.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, revokedAt: null },
      data: { revokedAt: NOW, revocationReason: 'admin_access_reset' },
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: USER_ID, revokedAt: null }, data: { revokedAt: NOW } });
    expect(tx.session.updateMany).toHaveBeenCalledWith({ where: { userId: USER_ID, revokedAt: null }, data: { revokedAt: NOW } });
    expect(tx.bookingClaimGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ bookingId: BOOKING_ID, channel: 'REMOTE', consumedAt: null, revokedAt: null }),
    }));
    expect(tx.bookingClaimGrant.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      bookingId: BOOKING_ID,
      channel: 'REMOTE',
      issuedByAdminSessionId: ADMIN_SESSION_ID,
      tokenDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    }) });
    const created = tx.bookingClaimGrant.create.mock.calls[0][0] as { data: { tokenDigest: string } };
    expect(created.data.tokenDigest).not.toContain(grant.token);
    const audit = tx.securityAuditEvent.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(audit.data).toMatchObject({ eventType: 'portal.access_reset', severity: 'medium', details: { bookingId: BOOKING_ID } });
    expect(JSON.stringify(audit)).not.toContain(USER_ID);
    expect(JSON.stringify(audit)).not.toContain(grant.token);
  });

  it.each([
    ['an unclaimed booking', { userId: null, accessStatus: 'PENDING' }, 'BOOKING_NOT_CLAIMED'],
    ['a booking linked but not verified', { accessStatus: 'PENDING' }, 'BOOKING_NOT_CLAIMED'],
    ['a stay that ended yesterday', { startDate: day(-4), endDate: day(-1) }, 'BOOKING_NOT_IN_ACCESS_WINDOW'],
    ['a check-in more than 7 days away', { startDate: day(8), endDate: day(12) }, 'BOOKING_NOT_IN_ACCESS_WINDOW'],
  ] as const)('refuses %s without touching the guest', async (_label, overrides, code) => {
    prismaMock.tx.booking.findUnique.mockResolvedValue(claimedBooking(overrides));

    await expect(resetGuestAccess({ bookingId: BOOKING_ID, adminSessionId: ADMIN_SESSION_ID }))
      .rejects.toEqual(new PortalAuthError(code));
    expect(prismaMock.tx.user.update).not.toHaveBeenCalled();
    expect(prismaMock.tx.session.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.tx.bookingClaimGrant.create).not.toHaveBeenCalled();
  });

  it('refuses an unknown booking', async () => {
    prismaMock.tx.booking.findUnique.mockResolvedValue(null);

    await expect(resetGuestAccess({ bookingId: BOOKING_ID, adminSessionId: ADMIN_SESSION_ID }))
      .rejects.toEqual(new PortalAuthError('INVALID_CLAIM'));
  });
});

describe('claiming with a password-less account', () => {
  const TOKEN_DIGEST = 'a'.repeat(64);

  function grantFor(bookingUserId: string | null) {
    return {
      id: 'grant-1',
      bookingId: bookingUserId ? BOOKING_ID : OTHER_BOOKING_ID,
      channel: 'REMOTE',
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      booking: claimedBooking({
        id: bookingUserId ? BOOKING_ID : OTHER_BOOKING_ID,
        userId: bookingUserId,
        accessStatus: bookingUserId ? 'VERIFIED' : 'PENDING',
      }),
    };
  }

  function claim() {
    return consumeBookingClaimGrant({ tokenDigest: TOKEN_DIGEST, phone: PHONE, origin: 'ABROAD', password: 'a-new-password-1234' });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof prismaMock.tx) => unknown) => callback(prismaMock.tx));
    prismaMock.tx.user.findUnique.mockResolvedValue({ id: USER_ID, phoneE164: PHONE, passwordHash: null });
    // A bcrypt-shaped hash that carries the cost factor it was asked for.
    bcryptMock.hash.mockImplementation(async (_password: string, rounds: number) => `$2b$${rounds}$${'x'.repeat(53)}`);
    prismaMock.tx.bookingClaimGrant.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.tx.booking.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => vi.useRealTimers());

  it('sets a new password through a grant for a booking the account already owns', async () => {
    prismaMock.tx.bookingClaimGrant.findUnique.mockResolvedValue(grantFor(USER_ID));

    await expect(claim()).resolves.toEqual({ userId: USER_ID, bookingId: BOOKING_ID });
    expect(prismaMock.tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { passwordHash: expect.stringMatching(/^\$2[aby]\$12\$/u) },
    });
    expect(bcryptMock.hash).toHaveBeenCalledWith('a-new-password-1234', 12);
  });

  it('uses the sign-up origin only to normalise the phone of a new account and does not store it', async () => {
    prismaMock.tx.bookingClaimGrant.findUnique.mockResolvedValue(grantFor(null));
    prismaMock.tx.user.findUnique.mockResolvedValue(null);

    await consumeBookingClaimGrant({ tokenDigest: TOKEN_DIGEST, phone: '6912345678', origin: 'GR', password: 'a-new-password-1234' });

    expect(prismaMock.tx.user.findUnique).toHaveBeenCalledWith({ where: { phoneE164: '+306912345678' } });
    expect(prismaMock.tx.user.create).toHaveBeenCalledWith({
      data: { id: expect.any(String), phoneE164: '+306912345678', passwordHash: expect.stringMatching(/^\$2[aby]\$12\$/u) },
    });
  });

  it("refuses a grant for someone else's booking, so a claim token cannot take the account over", async () => {
    prismaMock.tx.bookingClaimGrant.findUnique.mockResolvedValue(grantFor(null));

    await expect(claim()).rejects.toEqual(new PortalAuthError('INVALID_CREDENTIALS'));
    expect(prismaMock.tx.user.update).not.toHaveBeenCalled();
    expect(prismaMock.tx.bookingClaimGrant.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.tx.booking.updateMany).not.toHaveBeenCalled();
  });
});
