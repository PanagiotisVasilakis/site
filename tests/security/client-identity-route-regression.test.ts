import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminSession: vi.fn(),
  signAdmin: vi.fn(),
  rateLimitQuery: vi.fn(),
  rateLimitTransaction: vi.fn(),
  stayRequestFindUnique: vi.fn(),
  stayRequestCreate: vi.fn(),
  privacyRequestFindMany: vi.fn(),
  getFeatureFlagsAsync: vi.fn(),
  consumeBookingClaimGrant: vi.fn(),
  deliverOutboxEvent: vi.fn(),
  createVerifiedErasureRequest: vi.fn(),
  getVerifiedGuestSessionFromCookies: vi.fn(),
  rotateRefreshToken: vi.fn(),
  logger: {
    setContext: vi.fn(),
    getContext: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const SYNTHETIC_ADMIN_DASH_CREDENTIAL = createHash('sha256')
  .update('client-identity-route-isolated-fixture', 'utf8')
  .digest('base64url');

vi.mock('@/lib/auth/admin', () => ({
  createAdminSession: mocks.createAdminSession,
  signAdmin: mocks.signAdmin,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.rateLimitTransaction,
    stayRequest: {
      findUnique: mocks.stayRequestFindUnique,
      create: mocks.stayRequestCreate,
    },
    privacyRequest: {
      findMany: mocks.privacyRequestFindMany,
    },
  },
}));

vi.mock('@/lib/bookingOutbox', () => ({
  deliverOutboxEvent: mocks.deliverOutboxEvent,
}));

vi.mock('@/lib/privacyService', () => ({
  createVerifiedErasureRequest: mocks.createVerifiedErasureRequest,
}));

vi.mock('@/lib/featureFlags', () => ({
  getFeatureFlagsAsync: mocks.getFeatureFlagsAsync,
}));

vi.mock('@/lib/portalAuthService', () => ({
  PortalAuthError: class PortalAuthError extends Error {},
  consumeBookingClaimGrant: mocks.consumeBookingClaimGrant,
}));

vi.mock('@/lib/guestDataStore', () => ({
  guestStore: {
    rotateRefreshToken: mocks.rotateRefreshToken,
    issueRefreshToken: vi.fn(),
    revokeRefreshFamily: vi.fn(),
  },
}));

vi.mock('@/lib/guestSession', () => ({
  clearRefreshCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  createRefreshCookie: vi.fn(),
  createSessionCookie: vi.fn(),
  getVerifiedGuestSessionFromCookies: mocks.getVerifiedGuestSessionFromCookies,
  issueGuestSession: vi.fn(),
  parseGuestSession: vi.fn(),
  parseGuestSessionBinding: vi.fn(),
}));

vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

import { POST as adminLogin } from '@/app/api/admin/login/route';
import { POST as createBookingRequest } from '@/app/api/booking-requests/route';
import { POST as createErasureRequest } from '@/app/api/dsar/requests/route';
import { POST as claimBooking } from '@/app/api/portal/claims/route';
import { POST as refreshPortalSession } from '@/app/api/portal/refresh/route';

const ATTACKER_IP = '203.0.113.195';

function request(
  path: string,
  init: ConstructorParameters<typeof NextRequest>[1] = {},
): NextRequest {
  const headers = new Headers(init.headers);
  headers.set('cf-connecting-ip', ATTACKER_IP);
  headers.set('x-real-ip', ATTACKER_IP);
  headers.set('x-forwarded-for', ATTACKER_IP);
  headers.set('forwarded', `for=${ATTACKER_IP};proto=https`);
  return new NextRequest(`https://guest.example${path}`, { ...init, headers });
}

async function expectGenericIdentityUnavailable(
  response: Response,
  sensitiveValues: readonly string[],
): Promise<void> {
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('retry-after')).toBeNull();
  expect(response.headers.get('set-cookie')).toBeNull();

  const body = await response.text();
  expect(body).toMatch(/service[_ ]unavailable|temporarily unavailable/i);
  const diagnostics = JSON.stringify([
    ...mocks.logger.trace.mock.calls,
    ...mocks.logger.debug.mock.calls,
    ...mocks.logger.info.mock.calls,
    ...mocks.logger.warn.mock.calls,
    ...mocks.logger.error.mock.calls,
  ]);
  for (const value of [
    ATTACKER_IP,
    'cf-connecting-ip',
    'x-real-ip',
    'x-forwarded-for',
    'forwarded',
    'x-origin-verified-client-ip',
    'x-origin-proxy-attestation',
    'CLIENT_IDENTITY_UNAVAILABLE',
    ...sensitiveValues,
  ]) {
    expect(body.toLowerCase()).not.toContain(value.toLowerCase());
    expect(diagnostics.toLowerCase()).not.toContain(value.toLowerCase());
  }
}

describe('missing client identity route boundary', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2');
    vi.stubEnv('SECURITY_PEPPER', 'a3-route-test-security-pepper-only');
    vi.stubEnv('ADMIN_DASH_SECRET', SYNTHETIC_ADMIN_DASH_CREDENTIAL);
    vi.stubEnv('BOOKING_REQUEST_WEBHOOK_URL', 'https://hooks.example/booking');
    mocks.rateLimitQuery.mockResolvedValue([{
      count: 1,
      reset_time: new Date(Date.now() + 60_000),
    }]);
    mocks.rateLimitTransaction.mockImplementation(async (callback) => callback({
      $queryRaw: mocks.rateLimitQuery,
    }));
    mocks.getVerifiedGuestSessionFromCookies.mockResolvedValue({
      user: { id: 'privacy-user-sensitive-marker' },
      booking: { id: 'privacy-booking-sensitive-marker' },
    });
    mocks.getFeatureFlagsAsync.mockResolvedValue({ portalEnabled: true });
  });

  it('blocks admin login before limiter or admin-session issuance', async () => {
    const accountToken = 'admin-dashboard-secret-marker';
    const response = await adminLogin(request('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: accountToken }),
    }), { params: Promise.resolve({}) });

    await expectGenericIdentityUnavailable(response, ['admin-login', accountToken]);
    expect(mocks.rateLimitQuery).not.toHaveBeenCalled();
    expect(mocks.createAdminSession).not.toHaveBeenCalled();
    expect(mocks.signAdmin).not.toHaveBeenCalled();
  });

  it('keeps D1A zero-write behavior when private identity has an invalid attestation', async () => {
    const accountToken = 'admin-dashboard-secret-marker';
    const response = await adminLogin(request('/api/admin/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-origin-verified-client-ip': '203.0.113.10',
        'x-origin-proxy-attestation': 'fedcba9876543210'.repeat(4),
      },
      body: JSON.stringify({ token: accountToken }),
    }), { params: Promise.resolve({}) });

    await expectGenericIdentityUnavailable(response, ['admin-login', accountToken]);
    expect(mocks.rateLimitQuery).not.toHaveBeenCalled();
    expect(mocks.createAdminSession).not.toHaveBeenCalled();
    expect(mocks.signAdmin).not.toHaveBeenCalled();
  });

  it('blocks a public booking write before limiter, domain, or outbox mutation', async () => {
    const idempotencyKey = 'd1a-booking-key-0001';
    const email = 'd1a-private-guest@example.test';
    const response = await createBookingRequest(request('/api/booking-requests', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        propertyName: 'D1A Test Property',
        locale: 'en',
        dateRange: {
          from: '2030-06-01T12:00:00.000Z',
          to: '2030-06-08T12:00:00.000Z',
        },
        guest: {
          firstName: 'D1A',
          lastName: 'Private',
          email,
          phone: '+12025550123',
        },
      }),
    }));

    await expectGenericIdentityUnavailable(response, [
      'booking-request',
      idempotencyKey,
      email,
    ]);
    expect(mocks.rateLimitQuery).not.toHaveBeenCalled();
    expect(mocks.stayRequestFindUnique).not.toHaveBeenCalled();
    expect(mocks.stayRequestCreate).not.toHaveBeenCalled();
    expect(mocks.deliverOutboxEvent).not.toHaveBeenCalled();
  });

  it('returns generic 503 and leaves domain state untouched when PostgreSQL limiter fails', async () => {
    mocks.rateLimitQuery.mockRejectedValue(new Error('synthetic database diagnostics'));
    const response = await createBookingRequest(request('/api/booking-requests', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'a3-booking-key-000001',
        'x-origin-verified-client-ip': '198.51.100.73',
        'x-origin-proxy-attestation': process.env.ORIGIN_PROXY_SHARED_SECRET ?? '',
      },
      body: JSON.stringify({
        propertyName: 'A3 Test Property',
        locale: 'en',
        dateRange: {
          from: '2030-06-01T12:00:00.000Z',
          to: '2030-06-08T12:00:00.000Z',
        },
        guest: {
          firstName: 'A3',
          lastName: 'Failure',
          email: 'a3-limiter-failure@example.test',
          phone: '+12025550124',
        },
      }),
    }));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBeNull();
    expect(await response.text()).toMatch(/temporarily unavailable/i);
    expect(mocks.rateLimitTransaction).toHaveBeenCalledOnce();
    expect(mocks.stayRequestFindUnique).not.toHaveBeenCalled();
    expect(mocks.stayRequestCreate).not.toHaveBeenCalled();
    expect(mocks.deliverOutboxEvent).not.toHaveBeenCalled();
  });

  it('blocks a claim before grant, ownership, audit, or credential mutation', async () => {
    const claimToken = `claim_${'C'.repeat(43)}`;
    const phone = '+12025550129';
    const password = 'd1a-claim-password-marker';
    const response = await claimBooking(request('/api/portal/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        claimToken,
        origin: 'ABROAD',
        phone,
        password,
        remember: true,
        acceptTerms: true,
      }),
    }), { params: Promise.resolve({}) });

    await expectGenericIdentityUnavailable(response, [
      'portal-claim',
      claimToken,
      phone,
      password,
    ]);
    expect(mocks.rateLimitQuery).not.toHaveBeenCalled();
    expect(mocks.consumeBookingClaimGrant).not.toHaveBeenCalled();
  });

  it('blocks refresh before rotation and never sets or clears auth cookies', async () => {
    const refreshToken = 'refresh-generation-sensitive-marker';
    const sessionToken = 'session-sensitive-marker';
    const response = await refreshPortalSession(request('/api/portal/refresh', {
      method: 'POST',
      headers: {
        cookie: `guest_rt=${refreshToken}; guest_session=${sessionToken}`,
        'user-agent': 'd1a-sensitive-device-marker',
      },
    }), { params: Promise.resolve({}) });

    await expectGenericIdentityUnavailable(response, [
      refreshToken,
      sessionToken,
      'd1a-sensitive-device-marker',
    ]);
    expect(mocks.rateLimitQuery).not.toHaveBeenCalled();
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('blocks a privacy mutation before limiter or erasure-request creation', async () => {
    const response = await createErasureRequest(request('/api/dsar/requests', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'guest_session=privacy-session-sensitive-marker',
      },
      body: JSON.stringify({ type: 'ERASURE', confirm: true }),
    }), { params: Promise.resolve({}) });

    await expectGenericIdentityUnavailable(response, [
      'privacy-erasure-request',
      'privacy-user-sensitive-marker',
      'privacy-booking-sensitive-marker',
      'privacy-session-sensitive-marker',
    ]);
    expect(mocks.rateLimitQuery).not.toHaveBeenCalled();
    expect(mocks.privacyRequestFindMany).not.toHaveBeenCalled();
    expect(mocks.createVerifiedErasureRequest).not.toHaveBeenCalled();
  });
});
