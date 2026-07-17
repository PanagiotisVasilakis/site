import type { NextRequest, NextResponse } from 'next/server';

import { guestStore } from '@/lib/guestDataStore';
import {
  clearRefreshCookie,
  createRefreshCookie,
  createSessionCookie,
  issueGuestSession,
  parseGuestSession,
} from '@/lib/guestSession';
import { requireCanonicalClientIp } from '@/lib/net/clientIdentity';
import { privacyHmac } from '@/lib/privacyHash';

export function requestAuthContext(request: NextRequest): { deviceHint: string; ipHint: string; ipHash: string } {
  // Identity must be available before any context HMAC is created. In
  // particular, never turn the sentinel `unknown` into a valid-looking hint.
  const ip = requireCanonicalClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ipHint = privacyHmac(ip, 'portal-auth:ip-hint:v1');
  return {
    deviceHint: privacyHmac(userAgent, 'portal-auth:device-hint:v1'),
    ipHint,
    ipHash: ipHint,
  };
}

export async function attachPortalAuthCookies(
  request: NextRequest,
  response: NextResponse,
  input: { userId: string; bookingId: string; remember: boolean },
): Promise<void> {
  // Resolve before revoking a family or issuing a persistent session. This is
  // intentionally earlier than the remember-me branch so every mutation path
  // observes the same fail-closed identity contract.
  const context = requestAuthContext(request);

  if (!input.remember) {
    const presentedRefreshToken = request.cookies.get('guest_rt')?.value;
    if (presentedRefreshToken) {
      await guestStore.revokeRefreshFamily(presentedRefreshToken);
    }
    const refreshCookie = clearRefreshCookie();
    response.cookies.set(refreshCookie.name, refreshCookie.value, refreshCookie.options);
  }

  const sessionToken = await issueGuestSession(input.userId, input.bookingId);
  const sessionCookie = createSessionCookie(sessionToken);
  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);

  if (input.remember) {
    const sessionId = parseGuestSession(sessionToken)?.sid;
    if (!sessionId) {
      throw new Error('Failed to bind refresh authorization to guest session');
    }
    const issued = await guestStore.issueRefreshToken(input.userId, 7, {
      session_id: sessionId,
      device_hint: context.deviceHint,
      ip_hint: context.ipHint,
    });
    const refreshCookie = createRefreshCookie(issued.token, 7);
    response.cookies.set(refreshCookie.name, refreshCookie.value, refreshCookie.options);
  }
}
