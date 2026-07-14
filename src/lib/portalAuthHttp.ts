import crypto from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

import { guestStore } from '@/lib/guestDataStore';
import { createRefreshCookie, createSessionCookie, issueGuestSession } from '@/lib/guestSession';
import { getClientIp } from '@/lib/net/getClientIp';

function privacyHash(value: string): string {
  const pepper = process.env.SECURITY_PEPPER || 'development-only-network-hash-pepper';
  return crypto.createHmac('sha256', pepper).update(value).digest('hex');
}

export function requestAuthContext(request: NextRequest): { deviceHint: string; ipHint: string; ipHash: string } {
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ip = getClientIp(request);
  return {
    deviceHint: privacyHash(userAgent),
    ipHint: privacyHash(ip),
    ipHash: privacyHash(ip),
  };
}

export async function attachPortalAuthCookies(
  request: NextRequest,
  response: NextResponse,
  input: { userId: string; bookingId: string; remember: boolean },
): Promise<void> {
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
