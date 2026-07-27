import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepareBookingClaimExchange: vi.fn(),
  consumeBookingClaimGrant: vi.fn(),
  attachPortalAuthCookies: vi.fn(),
  checkSensitiveRateLimit: vi.fn(),
  getFeatureFlagsAsync: vi.fn(),
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

vi.mock('@/lib/portalAuthService', () => {
  class PortalAuthError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = 'PortalAuthError';
    }
  }
  return {
    PortalAuthError,
    prepareBookingClaimExchange: mocks.prepareBookingClaimExchange,
    consumeBookingClaimGrant: mocks.consumeBookingClaimGrant,
  };
});

vi.mock('@/lib/portalAuthHttp', () => ({
  attachPortalAuthCookies: mocks.attachPortalAuthCookies,
  requestAuthContext: vi.fn(() => ({
    deviceHint: 'synthetic-device-hint',
    ipHint: 'synthetic-ip-hint',
    ipHash: 'synthetic-ip-hash',
  })),
}));

vi.mock('@/lib/sensitiveRateLimit', () => ({
  checkSensitiveRateLimit: mocks.checkSensitiveRateLimit,
}));

vi.mock('@/lib/featureFlags', () => ({
  getFeatureFlagsAsync: mocks.getFeatureFlagsAsync,
}));

vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

import { POST as exchangeClaim } from '@/app/api/portal/claim-exchange/route';
import { POST as consumeClaim } from '@/app/api/portal/claims/route';
import {
  PORTAL_CLAIM_EXCHANGE_COOKIE,
  createPortalClaimExchangeCookie,
} from '@/lib/portalClaimExchange';
import { PortalAuthError } from '@/lib/portalAuthService';

const TOKEN = `claim_${'T'.repeat(43)}`;
const TOKEN_DIGEST = 'a1'.repeat(32);

function request(
  pathname: string,
  body: Record<string, unknown>,
  cookie?: string,
): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(`https://guest.example${pathname}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function claimBody() {
  return {
    origin: 'ABROAD',
    phone: '+12025550139',
    password: 'transport-test-password',
    remember: false,
    acceptTerms: true,
  };
}

describe('claim capability transport', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.getFeatureFlagsAsync.mockResolvedValue({ portalEnabled: true });
    mocks.checkSensitiveRateLimit.mockResolvedValue({
      allowed: true,
      limit: 20,
      remaining: 19,
      resetAt: new Date(Date.now() + 60_000),
    });
    mocks.prepareBookingClaimExchange.mockResolvedValue({
      tokenDigest: TOKEN_DIGEST,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    mocks.consumeBookingClaimGrant.mockResolvedValue({
      userId: 'transport-user',
      bookingId: 'transport-booking',
    });
    mocks.attachPortalAuthCookies.mockResolvedValue(undefined);
  });

  it('exchanges a POST-body token for a short-lived production-safe HttpOnly cookie', async () => {
    const response = await exchangeClaim(
      request('/api/portal/claim-exchange', { claimToken: TOKEN }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('location')).toBeNull();
    const cookie = response.cookies.get(PORTAL_CLAIM_EXCHANGE_COOKIE);
    expect(cookie?.value).toBe(TOKEN_DIGEST);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe('strict');
    expect(cookie?.path).toBe('/api/portal');
    expect(cookie?.maxAge).toBe(300);
    expect(await response.text()).not.toContain(TOKEN);
  });

  it('claims from the server-generated digest and clears the exchange cookie on success', async () => {
    const response = await consumeClaim(
      request(
        '/api/portal/claims',
        claimBody(),
        `${PORTAL_CLAIM_EXCHANGE_COOKIE}=${TOKEN_DIGEST}`,
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(mocks.consumeBookingClaimGrant).toHaveBeenCalledWith(
      expect.objectContaining({ tokenDigest: TOKEN_DIGEST }),
    );
    expect(mocks.consumeBookingClaimGrant.mock.calls[0]?.[0]).not.toHaveProperty('token');
    const cleared = response.cookies.get(PORTAL_CLAIM_EXCHANGE_COOKIE);
    expect(cleared?.value).toBe('');
    expect(cleared?.maxAge).toBe(0);
    expect(response.headers.get('location')).toBeNull();
  });

  it('clears an existing exchange cookie when the token is expired or invalid', async () => {
    mocks.prepareBookingClaimExchange.mockRejectedValueOnce(new PortalAuthError('INVALID_CLAIM'));
    const response = await exchangeClaim(
      request(
        '/api/portal/claim-exchange',
        { claimToken: TOKEN },
        `${PORTAL_CLAIM_EXCHANGE_COOKIE}=${TOKEN_DIGEST}`,
      ),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(401);
    const cleared = response.cookies.get(PORTAL_CLAIM_EXCHANGE_COOKIE);
    expect(cleared?.value).toBe('');
    expect(cleared?.maxAge).toBe(0);
    expect(await response.text()).not.toContain(TOKEN);
  });

  it('rejects replay and clears the exchange cookie again without exposing the capability', async () => {
    const cookie = `${PORTAL_CLAIM_EXCHANGE_COOKIE}=${TOKEN_DIGEST}`;
    const first = await consumeClaim(
      request('/api/portal/claims', claimBody(), cookie),
      { params: Promise.resolve({}) },
    );
    expect(first.status).toBe(200);

    mocks.consumeBookingClaimGrant.mockRejectedValueOnce(new PortalAuthError('INVALID_CLAIM'));
    const replay = await consumeClaim(
      request('/api/portal/claims', claimBody(), cookie),
      { params: Promise.resolve({}) },
    );
    expect(replay.status).toBe(401);
    expect(replay.cookies.get(PORTAL_CLAIM_EXCHANGE_COOKIE)?.maxAge).toBe(0);
    const body = await replay.text();
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain(TOKEN_DIGEST);
  });

  it('never creates or parses a claim capability in application URLs', () => {
    const files = [
      'src/app/[locale]/guest/UnifiedGuestClient.tsx',
      'src/app/[locale]/guest/sign-up/page.tsx',
      'src/app/admin/guests/page.tsx',
      'src/app/api/admin/bookings/[id]/claim-grants/route.ts',
      'src/app/api/portal/claim-exchange/route.ts',
      'src/app/api/portal/claims/route.ts',
      'src/lib/portalClaimExchange.ts',
      'src/proxy.ts',
      'deploy/nginx/nginx.conf.template',
    ];
    const source = files.map((relative) => (
      readFileSync(path.join(process.cwd(), relative), 'utf8')
    )).join('\n');
    for (const forbidden of [
      /[?&#]claim(?:Token)?=/iu,
      /searchParams?\.get\(['"]claim(?:Token)?['"]\)/u,
      /searchParams?\.set\(['"]claim(?:Token)?['"]/u,
      /\$request_uri/u,
      /claim-link/u,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
    expect(source).toContain('$uri');
  });
});

describe('claim exchange cookie bounds', () => {
  it('never outlives the underlying one-time grant', () => {
    const now = new Date('2030-01-01T00:00:00.000Z');
    const cookie = createPortalClaimExchangeCookie(
      TOKEN_DIGEST,
      new Date('2030-01-01T00:01:15.000Z'),
      now,
    );
    expect(cookie.options.maxAge).toBe(75);
  });
});
