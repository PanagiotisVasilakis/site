import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, createSuccessResponse as success } from '@/lib/apiErrorHandler';
import { guestStore } from '@/lib/guestDataStore';
import {
  createSessionCookie,
  createRefreshCookie,
  clearSessionCookie,
  clearRefreshCookie,
  issueGuestSession,
  parseGuestSession,
  revokeGuestSession,
} from '@/lib/guestSession';
import { logger as elogger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { requestAuthContext } from '@/lib/portalAuthHttp';
import { toSafeLocalPath } from '@/lib/safeLocalPath';

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

function concurrentRefreshResponse(): NextResponse {
  return NextResponse.json({
    success: false,
    error: {
      code: 'REFRESH_IN_PROGRESS',
      message: 'A session refresh is already in progress. Retry shortly.',
      details: { retryable: true },
    },
  }, {
    status: 409,
    headers: {
      'cache-control': 'no-store',
      'retry-after': '1',
    },
  });
}

type RefreshSessionResult =
  | { status: 'refreshed'; jwt: string; refreshToken: string }
  | { status: 'concurrent' }
  | { status: 'failed' };

async function issueRefreshedSession(
  request: NextRequest,
  refreshToken: string,
): Promise<RefreshSessionResult> {
  const context = requestAuthContext(request);
  const rotated = await guestStore.rotateRefreshToken(refreshToken, 7, {
    device_hint: context.deviceHint,
    ip_hint: context.ipHint,
  });
  if (rotated.status === 'concurrent') {
    elogger.info('refresh_token.concurrent', {
      correlationId: elogger.getContext()?.correlationId,
    });
    metrics.counter('refresh_token.concurrent', 1);
    return { status: 'concurrent' };
  }

  if (rotated.status === 'replayed') {
    elogger.warn('refresh_token.replay_detected', {
      correlationId: elogger.getContext()?.correlationId,
    });
    metrics.counter('refresh_token.replay_detected', 1);
    return { status: 'failed' };
  }

  if (rotated.status !== 'rotated' || !rotated.old || !rotated.rec || !rotated.token) {
    return { status: 'failed' };
  }

  elogger.info('refresh_token.rotated', {
    correlationId: elogger.getContext()?.correlationId,
    user_id: rotated.old.user_id,
    old_id: rotated.old.id,
    new_id: rotated.rec.id,
    family_id: rotated.rec.family_id,
  });
  metrics.counter('refresh_token.rotated', 1);

  const user = await guestStore.findUserById(rotated.old.user_id);
  const booking = user ? await guestStore.findEligibleBookingForUser(user.id) : undefined;
  if (!user || !booking) {
    await guestStore.revokeRefreshToken(rotated.rec.id);
    return { status: 'failed' };
  }

  return {
    status: 'refreshed',
    jwt: await issueGuestSession(user.id, booking.id),
    refreshToken: rotated.token,
  };
}

async function revokeCurrentSession(req: NextRequest): Promise<void> {
  await revokeGuestSession(parseGuestSession(req.cookies.get('guest_session')?.value));
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Support GET-style redirect flow too by allowing query params in POST.
  const nextUrl = req.nextUrl;
  const nextRaw = nextUrl.searchParams.get('next');
  const nextParam = toSafeLocalPath(nextRaw, req.url) ?? undefined;
  const refresh = req.cookies.get('guest_rt')?.value;
  if (!refresh) {
    return unauthorizedResponse(req);
  }

  const refreshed = await issueRefreshedSession(req, refresh);
  if (refreshed.status === 'concurrent') {
    return concurrentRefreshResponse();
  }
  if (refreshed.status === 'failed') {
    return unauthorizedResponse(req);
  }
  await revokeCurrentSession(req);

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
