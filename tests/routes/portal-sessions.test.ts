import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parseGuestSession: vi.fn(),
  verifyGuestSessionAccess: vi.fn(),
  checkSensitiveRateLimit: vi.fn(),
  refundSensitiveIdentifierAttempt: vi.fn(),
  authenticatePortalUser: vi.fn(),
  attachPortalAuthCookies: vi.fn(),
  requestAuthContext: vi.fn(),
}));
const flags = vi.hoisted(() => ({ portalEnabled: true, checkinEnabled: true }));

vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: async () => ({ ...flags }) }));
vi.mock('@/lib/guestSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/guestSession')>()),
  parseGuestSession: mocks.parseGuestSession,
  verifyGuestSessionAccess: mocks.verifyGuestSessionAccess,
}));
vi.mock('@/lib/sensitiveRateLimit', () => ({
  checkSensitiveRateLimit: mocks.checkSensitiveRateLimit,
  refundSensitiveIdentifierAttempt: mocks.refundSensitiveIdentifierAttempt,
}));
vi.mock('@/lib/portalAuthService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalAuthService')>()),
  authenticatePortalUser: mocks.authenticatePortalUser,
}));
vi.mock('@/lib/portalAuthHttp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalAuthHttp')>()),
  attachPortalAuthCookies: mocks.attachPortalAuthCookies,
  requestAuthContext: mocks.requestAuthContext,
}));

import { GET, POST } from '@/app/api/portal/sessions/route';
import { PortalAuthError } from '@/lib/portalAuthService';
import { logger } from '@/lib/logger-enterprise';

const BOOKING_ID = '77000000-0000-4000-8000-000000000001';
const PHONE = '+30 691 234 5678';

describe('GET /api/portal/sessions status', () => {
  function status(cookie = 'guest_session=signed') {
    return GET(new NextRequest('http://localhost:3000/api/portal/sessions', {
      headers: cookie ? { cookie } : {},
    }), { params: Promise.resolve({}) });
  }

  beforeEach(() => {
    flags.portalEnabled = true;
    flags.checkinEnabled = true;
    mocks.parseGuestSession.mockReturnValue({ type: 'guest', sid: 's', booking: { id: BOOKING_ID } });
  });

  it('returns the booking of the verified session and check-in flag', async () => {
    mocks.verifyGuestSessionAccess.mockResolvedValue({ type: 'guest', sid: 's', booking: { id: BOOKING_ID } });

    const response = await status();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ authenticated: true, bookingId: BOOKING_ID, checkinEnabled: true });
  });

  it('reports stale sessions as signed out and skips verification for anonymous callers', async () => {
    mocks.verifyGuestSessionAccess.mockResolvedValue(null);
    const stale = await status();
    expect(stale.status).toBe(200);
    expect((await stale.json()).data).toEqual({ authenticated: false, bookingId: null, checkinEnabled: true });

    mocks.verifyGuestSessionAccess.mockClear();
    mocks.parseGuestSession.mockReturnValue(null);
    const anon = await status('');
    expect(anon.status).toBe(200);
    expect((await anon.json()).data).toEqual({ authenticated: false, bookingId: null, checkinEnabled: true });
    expect(mocks.verifyGuestSessionAccess).not.toHaveBeenCalled();
  });

  it('propagates checkinEnabled=false and 404s without verification when portal is disabled', async () => {
    flags.checkinEnabled = false;
    mocks.verifyGuestSessionAccess.mockResolvedValueOnce({ type: 'guest', sid: 's', booking: { id: BOOKING_ID } });
    expect((await (await status()).json()).data).toEqual({ authenticated: true, bookingId: BOOKING_ID, checkinEnabled: false });

    mocks.verifyGuestSessionAccess.mockResolvedValueOnce(null);
    expect((await (await status()).json()).data).toEqual({ authenticated: false, bookingId: null, checkinEnabled: false });

    flags.portalEnabled = false;
    mocks.verifyGuestSessionAccess.mockClear();
    expect((await status()).status).toBe(404);
    expect(mocks.verifyGuestSessionAccess).not.toHaveBeenCalled();
  });

  it('marks expired sessions with guest_rt cookie as refreshable', async () => {
    mocks.parseGuestSession.mockReturnValue(null);
    mocks.verifyGuestSessionAccess.mockResolvedValue(null);

    const response = await status('guest_rt=token-id.secret');

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      authenticated: false,
      bookingId: null,
      checkinEnabled: true,
      refreshable: true,
    });
  });
});

describe('POST /api/portal/sessions sign-in, rate limit, and redirects', () => {
  function signIn(
    body: Record<string, unknown> = { phone: PHONE, password: 'correct horse battery' },
    cookie = 'lang=el',
  ) {
    return POST(new NextRequest('http://localhost:3000/api/portal/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    }), { params: Promise.resolve({}) });
  }

  beforeEach(() => {
    flags.portalEnabled = true;
    flags.checkinEnabled = true;
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true, limit: 5, remaining: 4, resetAt: new Date() });
    mocks.refundSensitiveIdentifierAttempt.mockResolvedValue(undefined);
    mocks.attachPortalAuthCookies.mockResolvedValue(undefined);
    mocks.requestAuthContext.mockReturnValue({ deviceHint: 'device-hint', ipHash: 'ip-hash' });
  });

  it('refunds the phone bucket after successful sign-in and skips refund on invalid credentials', async () => {
    mocks.authenticatePortalUser.mockResolvedValue({ userId: 'user-1', bookingId: 'booking-1' });
    const ok = await signIn();
    expect(ok.status).toBe(200);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ scope: 'portal-session', identifier: PHONE }));
    expect(mocks.refundSensitiveIdentifierAttempt).toHaveBeenCalledExactlyOnceWith({ scope: 'portal-session', identifier: PHONE });

    mocks.refundSensitiveIdentifierAttempt.mockClear();
    mocks.authenticatePortalUser.mockRejectedValue(new PortalAuthError('INVALID_CREDENTIALS'));
    expect((await signIn()).status).toBe(401);
    expect(mocks.refundSensitiveIdentifierAttempt).not.toHaveBeenCalled();
  });

  it('still signs the guest in when refund persistence fails and rejects unknown body keys before limiting', async () => {
    mocks.authenticatePortalUser.mockResolvedValue({ userId: 'user-1', bookingId: 'booking-1' });
    mocks.refundSensitiveIdentifierAttempt.mockRejectedValue(new Error('database unavailable'));
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const ok = await signIn();
    expect(ok.status).toBe(200);
    expect(warn).toHaveBeenCalledWith('portal_session.rate_limit_refund_failed', { error: 'Error' });

    mocks.checkSensitiveRateLimit.mockClear();
    mocks.authenticatePortalUser.mockClear();
    mocks.attachPortalAuthCookies.mockClear();
    const invalid = await signIn({ phone: PHONE, password: 'correct horse battery', rememberMe: true });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.details.validationErrors).toEqual([expect.objectContaining({ code: 'unrecognized_keys' })]);
    expect(mocks.checkSensitiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.authenticatePortalUser).not.toHaveBeenCalled();
    expect(mocks.attachPortalAuthCookies).not.toHaveBeenCalled();
  });

  it('redirects to check-in when enabled and stay hub when check-in is off', async () => {
    mocks.authenticatePortalUser.mockResolvedValue({ userId: 'user-1', bookingId: 'booking-1' });

    const checkInRes = await signIn();
    expect(checkInRes.status).toBe(200);
    expect((await checkInRes.json()).data).toEqual({ bookingId: 'booking-1', redirect: '/el/check-in' });

    flags.checkinEnabled = false;
    const stayRes = await signIn();
    expect(stayRes.status).toBe(200);
    expect((await stayRes.json()).data).toEqual({ bookingId: 'booking-1', redirect: '/el/stay' });
  });
});
