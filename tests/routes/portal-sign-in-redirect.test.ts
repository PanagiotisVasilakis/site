import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkSensitiveRateLimit: vi.fn(),
  refundSensitiveIdentifierAttempt: vi.fn(),
  authenticatePortalUser: vi.fn(),
  consumeBookingClaimGrant: vi.fn(),
  attachPortalAuthCookies: vi.fn(),
  requestAuthContext: vi.fn(),
  readPortalClaimExchange: vi.fn(),
}));
const flags = vi.hoisted(() => ({ portalEnabled: true, checkinEnabled: true }));

vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: async () => ({ ...flags }) }));
vi.mock('@/lib/sensitiveRateLimit', () => ({
  checkSensitiveRateLimit: mocks.checkSensitiveRateLimit,
  refundSensitiveIdentifierAttempt: mocks.refundSensitiveIdentifierAttempt,
}));
vi.mock('@/lib/portalAuthService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalAuthService')>()),
  authenticatePortalUser: mocks.authenticatePortalUser,
  consumeBookingClaimGrant: mocks.consumeBookingClaimGrant,
}));
// The real requestAuthContext needs the ingress identity headers; a plain test request has none.
vi.mock('@/lib/portalAuthHttp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalAuthHttp')>()),
  attachPortalAuthCookies: mocks.attachPortalAuthCookies,
  requestAuthContext: mocks.requestAuthContext,
}));
vi.mock('@/lib/portalClaimExchange', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/portalClaimExchange')>()),
  readPortalClaimExchange: mocks.readPortalClaimExchange,
}));

import { POST as claim } from '@/app/api/portal/claims/route';
import { POST as signIn } from '@/app/api/portal/sessions/route';

const PHONE = '+306912345678';
const PASSWORD = 'correct-horse-battery';
const TOKEN_DIGEST = 'a1'.repeat(32);

function post(pathname: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'lang=el' },
    body: JSON.stringify(body),
  });
}

function signInRequest() {
  return signIn(post('/api/portal/sessions', { phone: PHONE, password: PASSWORD }), { params: Promise.resolve({}) });
}

function claimRequest() {
  return claim(
    post('/api/portal/claims', { origin: 'GR', phone: PHONE, password: PASSWORD, acceptTerms: true }),
    { params: Promise.resolve({}) },
  );
}

describe('portal sign-in redirect', () => {
  beforeEach(() => {
    flags.portalEnabled = true;
    flags.checkinEnabled = true;
    mocks.checkSensitiveRateLimit.mockResolvedValue({ allowed: true, limit: 5, remaining: 4, resetAt: new Date() });
    mocks.refundSensitiveIdentifierAttempt.mockResolvedValue(undefined);
    mocks.authenticatePortalUser.mockResolvedValue({ userId: 'user-1', bookingId: 'booking-1' });
    mocks.consumeBookingClaimGrant.mockResolvedValue({ userId: 'user-1', bookingId: 'booking-1' });
    mocks.attachPortalAuthCookies.mockResolvedValue(undefined);
    mocks.requestAuthContext.mockReturnValue({ deviceHint: 'device-hint', ipHint: 'ip-hint', ipHash: 'ip-hash' });
    mocks.readPortalClaimExchange.mockReturnValue(TOKEN_DIGEST);
  });

  it('sends a guest who signs in to the check-in page while check-in is on', async () => {
    const response = await signInRequest();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ bookingId: 'booking-1', redirect: '/el/check-in' });
  });

  it('sends a guest who signs in to the stay hub while check-in is off', async () => {
    flags.checkinEnabled = false;

    const response = await signInRequest();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ bookingId: 'booking-1', redirect: '/el/stay' });
  });

  it('sends a guest who claims a booking to the check-in page while check-in is on', async () => {
    const response = await claimRequest();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ bookingId: 'booking-1', redirect: '/el/check-in' });
  });

  it('sends a guest who claims a booking to the stay hub while check-in is off', async () => {
    flags.checkinEnabled = false;

    const response = await claimRequest();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ bookingId: 'booking-1', redirect: '/el/stay' });
  });
});
