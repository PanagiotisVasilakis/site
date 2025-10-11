import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, createSuccessResponse as success, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { guestStore } from '@/lib/guestDataStore';
import { createSessionCookie, createRefreshCookie, signGuestSession, GuestSessionPayload } from '@/lib/guestSession';
import { logger as elogger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Support GET-style redirect flow too by allowing query params in POST
  const nextUrl = req.nextUrl
  const nextRaw = nextUrl.searchParams.get('next');
  const isSafePath = (p?: string | null) => !!p && p.startsWith('/') && !p.startsWith('//');
  const nextParam = isSafePath(nextRaw) ? nextRaw! : undefined;
  const refresh = req.cookies.get('guest_rt')?.value;
  if (!refresh) throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Missing refresh token');

  const rec = await guestStore.verifyRefreshToken(refresh);
  if (!rec) throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Invalid refresh token');

  // Rotate on use
  const rotated = await guestStore.rotateRefreshToken(refresh);
  const rt = rotated.token;
  if (rotated.old && rotated.rec) {
    elogger.info('refresh_token.rotated', { correlationId: elogger.getContext()?.correlationId, user_id: rotated.old.user_id, old_id: rotated.old.id, new_id: rotated.rec.id, family_id: rotated.rec.family_id });
    metrics.counter('refresh_token.rotated', 1);
  }

  // Check if user has any current/future booking; in dev store, pick any linked booking via access table
  const u = await guestStore.findUserById(rec.user_id);
  const b = u ? await guestStore.findEligibleBookingForUser(u.id) : undefined;
  const payload: GuestSessionPayload = {
    user: u ? { id: u.id } : undefined,
    booking: b ? { id: b.id } : undefined,
  };
  const jwt = signGuestSession(payload);
  const sessionCookie = createSessionCookie(jwt);
  const refreshCookie = rt ? createRefreshCookie(rt) : undefined;

  const res = success({ refreshed: true });
  res.headers.append('Set-Cookie', `${sessionCookie.name}=${sessionCookie.value}; Path=${sessionCookie.options.path}; HttpOnly; SameSite=Lax; Max-Age=${sessionCookie.options.maxAge};${sessionCookie.options.secure ? ' Secure;' : ''}`);
  if (refreshCookie) {
    res.headers.append('Set-Cookie', `${refreshCookie.name}=${refreshCookie.value}; Path=${refreshCookie.options.path}; HttpOnly; SameSite=Lax; Max-Age=${refreshCookie.options.maxAge};${refreshCookie.options.secure ? ' Secure;' : ''}`);
  }
  // If next is provided, perform a redirect after setting cookies
  if (nextParam) {
    const redirectResponse = new NextResponse(null, { status: 302 });
    redirectResponse.headers.set('Location', nextParam);
    res.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        redirectResponse.headers.append(key, value);
      } else {
        redirectResponse.headers.set(key, value);
      }
    });
    return redirectResponse;
  }
  return res;
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  // Proxy GET to POST logic for convenience but handle redirects explicitly
  const refresh = req.cookies.get('guest_rt')?.value;
  const nextRaw = req.nextUrl.searchParams.get('next');
  const failureRaw = req.nextUrl.searchParams.get('failure');
  const isSafePath = (p?: string | null) => !!p && p.startsWith('/') && !p.startsWith('//');
  const nextParam = isSafePath(nextRaw) ? nextRaw! : undefined;
  const failureParam = isSafePath(failureRaw) ? failureRaw! : undefined;
  
  if (!refresh) {
    if (failureParam) {
      const failureResponse = new NextResponse(null, { status: 302 });
      failureResponse.headers.set('Location', failureParam);
      return failureResponse;
    }
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Missing refresh token');
  }
  const rec = await guestStore.verifyRefreshToken(refresh);
  if (!rec) {
    if (failureParam) {
      const failureResponse = new NextResponse(null, { status: 302 });
      failureResponse.headers.set('Location', failureParam);
      return failureResponse;
    }
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Invalid refresh token');
  }
  const rotated = await guestStore.rotateRefreshToken(refresh);
  const rt = rotated.token;
  if (rotated.old && rotated.rec) {
    elogger.info('refresh_token.rotated', { correlationId: elogger.getContext()?.correlationId, user_id: rotated.old.user_id, old_id: rotated.old.id, new_id: rotated.rec.id, family_id: rotated.rec.family_id });
    metrics.counter('refresh_token.rotated', 1);
  }
  const u = await guestStore.findUserById(rec.user_id);
  const b = u ? await guestStore.findEligibleBookingForUser(u.id) : undefined;
  const payload: GuestSessionPayload = {
    user: u ? { id: u.id } : undefined,
    booking: b ? { id: b.id } : undefined,
  };
  const jwt = signGuestSession(payload);
  const sessionCookie = createSessionCookie(jwt);
  const refreshCookie = rt ? createRefreshCookie(rt) : undefined;
  const headers = new Headers();
  headers.append('Set-Cookie', `${sessionCookie.name}=${sessionCookie.value}; Path=${sessionCookie.options.path}; HttpOnly; SameSite=Lax; Max-Age=${sessionCookie.options.maxAge};${sessionCookie.options.secure ? ' Secure;' : ''}`);
  if (refreshCookie) {
    headers.append('Set-Cookie', `${refreshCookie.name}=${refreshCookie.value}; Path=${refreshCookie.options.path}; HttpOnly; SameSite=Lax; Max-Age=${refreshCookie.options.maxAge};${refreshCookie.options.secure ? ' Secure;' : ''}`);
  }
  if (nextParam) {
    const redirectResponse = new NextResponse(null, { status: 302 });
    redirectResponse.headers.set('Location', nextParam);
    headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        redirectResponse.headers.append(key, value);
      } else {
        redirectResponse.headers.set(key, value);
      }
    });
    return redirectResponse;
  }
  return new NextResponse(null, { status: 204, headers });
});
