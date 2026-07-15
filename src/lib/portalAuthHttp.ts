import type { NextRequest, NextResponse } from 'next/server';

import { guestStore } from '@/lib/guestDataStore';
import {
  clearRefreshCookie,
  createRefreshCookie,
  createSessionCookie,
  issueGuestSession,
} from '@/lib/guestSession';
import { getClientIp } from '@/lib/net/getClientIp';
import { privacyHmac } from '@/lib/privacyHash';

export function requestAuthContext(request: NextRequest): { deviceHint: string; ipHint: string; ipHash: string } {
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ip = getClientIp(request);
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
    const context = requestAuthContext(request);
    const issued = await guestStore.issueRefreshToken(input.userId, 7, {
      device_hint: context.deviceHint,
      ip_hint: context.ipHint,
    });
    const refreshCookie = createRefreshCookie(issued.token, 7);
    response.cookies.set(refreshCookie.name, refreshCookie.value, refreshCookie.options);
  }
}
