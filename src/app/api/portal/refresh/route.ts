import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, createSuccessResponse as success } from '@/lib/apiErrorHandler';
import { guestStore } from '@/lib/guestDataStore';
import {
  createSessionCookie,
  createRefreshCookie,
  clearSessionCookie,
  clearRefreshCookie,
  signGuestSession,
  GuestSessionPayload,
} from '@/lib/guestSession';
import { logger as elogger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';

const isSafePath = (p?: string | null): p is string =>
  typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');

function applyAuthCookies(response: NextResponse, sessionJwt: string, refreshToken?: string): void {
  const sessionCookie = createSessionCookie(sessionJwt);
  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);

  if (refreshToken) {
    const refreshCookie = createRefreshCookie(refreshToken);
    response.cookies.set(refreshCookie.name, refreshCookie.value, refreshCookie.options);
  }
}

function clearAuthCookies(response: NextResponse): void {
  const sessionCookie = clearSessionCookie();
  const refreshCookie = clearRefreshCookie();
  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);
  response.cookies.set(refreshCookie.name, refreshCookie.value, refreshCookie.options);
}

function unauthorizedResponse(request: NextRequest, failurePath?: string): NextResponse {
  if (failurePath) {
    const response = NextResponse.redirect(new URL(failurePath, request.url), 302);
    clearAuthCookies(response);
    return response;
  }

  const response = new NextResponse('Unauthorized', { status: 401 });
  clearAuthCookies(response);
  return response;
}

async function issueRefreshedSession(refreshToken: string): Promise<{ jwt: string; refreshToken: string } | null> {
  const rec = await guestStore.verifyRefreshToken(refreshToken);
  if (!rec) return null;

  // Rotate on use
  const rotated = await guestStore.rotateRefreshToken(refreshToken);
  if (rotated.old && rotated.rec) {
    elogger.info('refresh_token.rotated', {
      correlationId: elogger.getContext()?.correlationId,
      user_id: rotated.old.user_id,
      old_id: rotated.old.id,
      new_id: rotated.rec.id,
      family_id: rotated.rec.family_id,
    });
    metrics.counter('refresh_token.rotated', 1);
  }

  // Require a successful rotation token and a valid booking subject for refreshed sessions.
  if (!rotated.token) {
    if (rotated.rec?.id) {
      await guestStore.revokeRefreshToken(rotated.rec.id);
    }
    await guestStore.revokeRefreshToken(rec.id);
    return null;
  }

  const user = await guestStore.findUserById(rec.user_id);
  const booking = user ? await guestStore.findEligibleBookingForUser(user.id) : undefined;
  if (!user || !booking) {
    if (rotated.rec?.id) {
      await guestStore.revokeRefreshToken(rotated.rec.id);
    }
    await guestStore.revokeRefreshToken(rec.id);
    return null;
  }

  const payload: GuestSessionPayload = {
    user: { id: user.id },
    booking: { id: booking.id },
  };
  return {
    jwt: signGuestSession(payload),
    refreshToken: rotated.token,
  };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Support GET-style redirect flow too by allowing query params in POST.
  const nextUrl = req.nextUrl;
  const nextRaw = nextUrl.searchParams.get('next');
  const nextParam = isSafePath(nextRaw) ? nextRaw : undefined;
  const refresh = req.cookies.get('guest_rt')?.value;
  if (!refresh) {
    return unauthorizedResponse(req);
  }

  const refreshed = await issueRefreshedSession(refresh);
  if (!refreshed) {
    return unauthorizedResponse(req);
  }

  const res = success({ refreshed: true });
  applyAuthCookies(res, refreshed.jwt, refreshed.refreshToken);

  // If next is provided, perform a redirect after setting cookies
  if (nextParam) {
    const redirectResponse = NextResponse.redirect(new URL(nextParam, req.url), 302);
    applyAuthCookies(redirectResponse, refreshed.jwt, refreshed.refreshToken);
    return redirectResponse;
  }

  return res;
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  // Proxy GET to POST logic for convenience but handle redirects explicitly.
  const refresh = req.cookies.get('guest_rt')?.value;
  const nextRaw = req.nextUrl.searchParams.get('next');
  const failureRaw = req.nextUrl.searchParams.get('failure');
  const nextParam = isSafePath(nextRaw) ? nextRaw : undefined;
  const failureParam = isSafePath(failureRaw) ? failureRaw : undefined;

  if (!refresh) {
    return unauthorizedResponse(req, failureParam);
  }

  const refreshed = await issueRefreshedSession(refresh);
  if (!refreshed) {
    return unauthorizedResponse(req, failureParam);
  }

  if (nextParam) {
    const redirectResponse = NextResponse.redirect(new URL(nextParam, req.url), 302);
    applyAuthCookies(redirectResponse, refreshed.jwt, refreshed.refreshToken);
    return redirectResponse;
  }

  const response = new NextResponse(null, { status: 204 });
  applyAuthCookies(response, refreshed.jwt, refreshed.refreshToken);
  return response;
});
