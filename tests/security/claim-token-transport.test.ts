import { readFileSync } from 'node:fs';

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
import { createPortalClaimExchangeCookie } from '@/lib/portalClaimExchange';
import { PortalAuthError } from '@/lib/portalAuthService';
import { privacyHmac } from '@/lib/privacyHash';

// Cookie name of the short-lived exchange (transport contract).
const PORTAL_CLAIM_EXCHANGE_COOKIE = 'booking_claim_exchange';

const TOKEN = `claim_${'T'.repeat(43)}`;
const TOKEN_DIGEST = 'a1'.repeat(32);
// Context of the MAC that binds the exchange cookie to the server pepper (transport contract).
const EXCHANGE_MAC_CONTEXT = 'portal-claim-exchange:v1';

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

// The value the exchange issues: the stored grant digest plus a MAC under the server pepper.
function exchangeCookieValue(digest = TOKEN_DIGEST): string {
  return `${digest}.${privacyHmac(digest, EXCHANGE_MAC_CONTEXT)}`;
}

function claimRequest(exchangeValue?: string): NextRequest {
  return request(
    '/api/portal/claims',
    claimBody(),
    exchangeValue === undefined ? undefined : `${PORTAL_CLAIM_EXCHANGE_COOKIE}=${exchangeValue}`,
  );
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
    expect(cookie?.value).toBe(exchangeCookieValue());
    expect(cookie?.value).toMatch(/^[a-f0-9]{64}\.[a-f0-9]{64}$/u);
    expect(cookie?.value).not.toBe(TOKEN_DIGEST);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe('strict');
    expect(cookie?.path).toBe('/api/portal');
    expect(cookie?.maxAge).toBe(300);
    expect(await response.text()).not.toContain(TOKEN);
  });

  it('claims from the server-generated digest and clears the exchange cookie on success', async () => {
    const response = await consumeClaim(
      claimRequest(exchangeCookieValue()),
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

  it('answers 422 for an unknown body key before the limiter or the grant lookup, without echoing the token', async () => {
    const response = await exchangeClaim(
      request('/api/portal/claim-exchange', { claimToken: TOKEN, claim: TOKEN }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(422);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    const text = await response.text();
    expect(text).toContain('unrecognized_keys');
    expect(text).not.toContain(TOKEN);
    expect(mocks.checkSensitiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.prepareBookingClaimExchange).not.toHaveBeenCalled();
    expect(response.cookies.get(PORTAL_CLAIM_EXCHANGE_COOKIE)).toBeUndefined();
  });

  it('rejects replay and clears the exchange cookie again without exposing the capability', async () => {
    const cookie = `${PORTAL_CLAIM_EXCHANGE_COOKIE}=${exchangeCookieValue()}`;
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

  it.each([
    ['a bare digest', () => TOKEN_DIGEST],
    ['a digest with a wrong MAC', () => `${TOKEN_DIGEST}.${'0'.repeat(64)}`],
    [
      'a digest with the MAC of another digest',
      () => `${TOKEN_DIGEST}.${privacyHmac('b2'.repeat(32), EXCHANGE_MAC_CONTEXT)}`,
    ],
    ['a valid pair with an extra segment', () => `${exchangeCookieValue()}.${'0'.repeat(64)}`],
    ['a truncated MAC', () => exchangeCookieValue().slice(0, -1)],
    ['an upper-case pair', () => exchangeCookieValue().toUpperCase()],
  ])('answers 401 without consuming the grant for %s', async (_label, makeExchangeValue) => {
    const response = await consumeClaim(
      claimRequest(makeExchangeValue()),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(401);
    expect(mocks.consumeBookingClaimGrant).not.toHaveBeenCalled();
    expect(mocks.attachPortalAuthCookies).not.toHaveBeenCalled();
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledOnce();
    // An unverified cookie names no grant, so only the client-address bucket is spent.
    expect(mocks.checkSensitiveRateLimit.mock.calls[0]?.[1]?.identifier).toBeUndefined();
    expect(response.cookies.get(PORTAL_CLAIM_EXCHANGE_COOKIE)?.maxAge).toBe(0);
  });

  it('answers 401 without consuming the grant when no exchange cookie is presented', async () => {
    const response = await consumeClaim(claimRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(401);
    expect(mocks.consumeBookingClaimGrant).not.toHaveBeenCalled();
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledOnce();
    expect(mocks.checkSensitiveRateLimit.mock.calls[0]?.[1]?.identifier).toBeUndefined();
  });

  it('accepts a cookie only under the server key it was issued with', async () => {
    const exchangeValue = exchangeCookieValue();
    const accepted = await consumeClaim(claimRequest(exchangeValue), { params: Promise.resolve({}) });
    expect(accepted.status).toBe(200);
    expect(mocks.consumeBookingClaimGrant).toHaveBeenCalledOnce();

    vi.stubEnv('SECURITY_PEPPER', 'rotated-security-pepper-that-is-at-least-32-characters');
    const rejected = await consumeClaim(claimRequest(exchangeValue), { params: Promise.resolve({}) });
    expect(rejected.status).toBe(401);
    expect(mocks.consumeBookingClaimGrant).toHaveBeenCalledOnce();
  });

  it('keys the claim limiter on the verified digest, not on the phone', async () => {
    const response = await consumeClaim(
      claimRequest(exchangeCookieValue()),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledOnce();
    const options = mocks.checkSensitiveRateLimit.mock.calls[0]?.[1];
    expect(options).toMatchObject({ scope: 'portal-claim', identifier: TOKEN_DIGEST });
    expect(JSON.stringify(options)).not.toContain(claimBody().phone);
  });

  it('answers 429 before the grant is touched when the digest budget is spent', async () => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({
      allowed: false,
      limit: 5,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });

    const response = await consumeClaim(
      claimRequest(exchangeCookieValue()),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(429);
    expect(mocks.consumeBookingClaimGrant).not.toHaveBeenCalled();
  });

  it('never creates or parses a claim capability in application URLs', () => {
    const source = [
      readFileSync('src/app/[locale]/guest/UnifiedGuestClient.tsx', 'utf8'),
      readFileSync('src/app/[locale]/guest/page.tsx', 'utf8'),
      readFileSync('src/app/admin/guests/page.tsx', 'utf8'),
      readFileSync('src/app/api/admin/bookings/[id]/claim-grants/route.ts', 'utf8'),
      readFileSync('src/app/api/admin/bookings/[id]/access-reset/route.ts', 'utf8'),
      readFileSync('src/app/api/portal/claim-exchange/route.ts', 'utf8'),
      readFileSync('src/app/api/portal/claims/route.ts', 'utf8'),
      readFileSync('src/lib/portalClaimExchange.ts', 'utf8'),
      readFileSync('src/proxy.ts', 'utf8'),
      readFileSync('deploy/nginx/nginx.conf.template', 'utf8'),
    ].join('\n');
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

describe('claim exchange cookie value', () => {
  it('is the digest followed by a MAC that depends on the server pepper', () => {
    const now = new Date('2030-01-01T00:00:00.000Z');
    const grantExpiresAt = new Date('2030-01-01T00:10:00.000Z');
    const issued = createPortalClaimExchangeCookie(TOKEN_DIGEST, grantExpiresAt, now);

    expect(issued.value).toBe(exchangeCookieValue());
    expect(issued.value).toMatch(/^[a-f0-9]{64}\.[a-f0-9]{64}$/u);

    vi.stubEnv('SECURITY_PEPPER', 'rotated-security-pepper-that-is-at-least-32-characters');
    expect(createPortalClaimExchangeCookie(TOKEN_DIGEST, grantExpiresAt, now).value).not.toBe(issued.value);
  });
});
