import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminSession: vi.fn(),
  signAdmin: vi.fn(),
  rateLimitQuery: vi.fn(),
  rateLimitTransaction: vi.fn(),
  securityAuditEventCreate: vi.fn(),
  getFeatureFlagsAsync: vi.fn(),
  consumeBookingClaimGrant: vi.fn(),
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
    securityAuditEvent: { create: mocks.securityAuditEventCreate },
  },
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
  GUEST_REFRESH_COOKIE: 'guest_rt',
  GUEST_SESSION_COOKIE: 'guest_session',
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
import { POST as reportClientError } from '@/app/api/errors/route';
import { POST as claimBooking } from '@/app/api/portal/claims/route';
import { POST as refreshPortalSession } from '@/app/api/portal/refresh/route';
import { POST as reportCspViolation } from '@/app/api/security/csp-report/route';

const ATTACKER_IP = '203.0.113.195';
const REPORT_MARKER = 'd1a-report-sensitive-marker';

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

// Unauthenticated public writes: each stores a security_audit_events row only
// after its per-address and global limiter calls.
const publicReportWrites = [
  {
    scope: 'client-error-report',
    send: (headers: Record<string, string> = {}) => reportClientError(request('/api/errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        error: { name: 'Error', message: REPORT_MARKER },
        context: {
          url: `https://guest.example/en/${REPORT_MARKER}`,
          timestamp: new Date().toISOString(),
        },
      }),
    }), { params: Promise.resolve({}) }),
  },
  {
    scope: 'csp-report',
    send: (headers: Record<string, string> = {}) => reportCspViolation(request('/api/security/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report', ...headers },
      body: JSON.stringify({
        'csp-report': {
          'document-uri': `https://guest.example/en/${REPORT_MARKER}`,
          'violated-directive': 'script-src-elem',
          'blocked-uri': `https://cdn.example/${REPORT_MARKER}.js`,
        },
      }),
    })),
  },
] as const;

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
    // Keeps the CSP audit write reachable (it is skipped without a URL); Prisma is mocked.
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@127.0.0.1:1/db');
    mocks.rateLimitQuery.mockResolvedValue([{
      count: 1,
      reset_time: new Date(Date.now() + 60_000),
    }]);
    mocks.rateLimitTransaction.mockImplementation(async (callback) => callback({
      $queryRaw: mocks.rateLimitQuery,
      $executeRawUnsafe: vi.fn(),
      securityAuditEvent: { create: mocks.securityAuditEventCreate },
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

  it.each(publicReportWrites)('blocks a public $scope write before either limiter call or audit persistence', async ({ scope, send }) => {
    const response = await send();

    await expectGenericIdentityUnavailable(response, [scope, REPORT_MARKER]);
    expect(mocks.rateLimitTransaction).not.toHaveBeenCalled();
    expect(mocks.rateLimitQuery).not.toHaveBeenCalled();
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
  });

  it.each(publicReportWrites)('keeps $scope zero-write behavior when private identity has an invalid attestation', async ({ scope, send }) => {
    const response = await send({
      'x-origin-verified-client-ip': '203.0.113.10',
      'x-origin-proxy-attestation': 'fedcba9876543210'.repeat(4),
    });

    await expectGenericIdentityUnavailable(response, [scope, REPORT_MARKER, '203.0.113.10']);
    expect(mocks.rateLimitTransaction).not.toHaveBeenCalled();
    expect(mocks.rateLimitQuery).not.toHaveBeenCalled();
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
  });

  it.each(publicReportWrites)('returns generic 503 without an audit write when the PostgreSQL limiter fails ($scope)', async ({ send }) => {
    mocks.rateLimitQuery.mockRejectedValue(new Error('synthetic database diagnostics'));
    const response = await send({
      'x-origin-verified-client-ip': '198.51.100.73',
      'x-origin-proxy-attestation': process.env.ORIGIN_PROXY_SHARED_SECRET ?? '',
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBeNull();
    const body = await response.text();
    expect(body).toMatch(/temporarily unavailable/i);
    expect(body).not.toContain('synthetic database diagnostics');
    expect(mocks.rateLimitTransaction).toHaveBeenCalledOnce();
    expect(mocks.securityAuditEventCreate).not.toHaveBeenCalled();
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
});
