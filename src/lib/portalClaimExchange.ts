import { timingSafeEqual } from 'node:crypto';

import type { NextRequest, NextResponse } from 'next/server';

import { privacyHmac } from '@/lib/privacyHash';

const PORTAL_CLAIM_EXCHANGE_COOKIE = 'booking_claim_exchange';
const PORTAL_CLAIM_EXCHANGE_MAX_AGE_SECONDS = 5 * 60;

const TOKEN_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const EXCHANGE_COOKIE_PATTERN = /^([a-f0-9]{64})\.([a-f0-9]{64})$/u;

// The stored grant digest can be read from the database, so the cookie also carries a MAC of it
// under SECURITY_PEPPER, which the database never holds.
function exchangeMac(tokenDigest: string): string {
  return privacyHmac(tokenDigest, 'portal-claim-exchange:v1');
}

function cookieSecurityOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/portal',
  };
}

export function createPortalClaimExchangeCookie(
  tokenDigest: string,
  grantExpiresAt: Date,
  now = new Date(),
) {
  if (!TOKEN_DIGEST_PATTERN.test(tokenDigest)) {
    throw new Error('Portal claim exchange received an invalid token digest');
  }
  const grantLifetimeSeconds = Math.floor((grantExpiresAt.getTime() - now.getTime()) / 1_000);
  if (grantLifetimeSeconds < 1) {
    throw new Error('Portal claim exchange grant is already expired');
  }
  return {
    name: PORTAL_CLAIM_EXCHANGE_COOKIE,
    value: `${tokenDigest}.${exchangeMac(tokenDigest)}`,
    options: {
      ...cookieSecurityOptions(),
      maxAge: Math.min(PORTAL_CLAIM_EXCHANGE_MAX_AGE_SECONDS, grantLifetimeSeconds),
    },
  };
}

function clearPortalClaimExchangeCookie() {
  return {
    name: PORTAL_CLAIM_EXCHANGE_COOKIE,
    value: '',
    options: {
      ...cookieSecurityOptions(),
      expires: new Date(0),
      maxAge: 0,
    },
  };
}

// Returns the grant digest only for a cookie this server issued: `digest.mac`, both 64 hex
// characters, the MAC matching. A bare digest, as stored in booking_claim_grants, is refused.
export function readPortalClaimExchange(request: NextRequest): string | null {
  const value = request.cookies.get(PORTAL_CLAIM_EXCHANGE_COOKIE)?.value ?? '';
  const match = EXCHANGE_COOKIE_PATTERN.exec(value);
  if (!match) return null;
  const [, digest, mac] = match;
  return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(exchangeMac(digest), 'hex')) ? digest : null;
}

export function clearPresentedPortalClaimExchange(
  request: NextRequest,
  response: NextResponse,
): void {
  if (!request.cookies.has(PORTAL_CLAIM_EXCHANGE_COOKIE)) return;
  const cookie = clearPortalClaimExchangeCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
}

export function setClaimTransportResponseHeaders(response: NextResponse): void {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer');
}
