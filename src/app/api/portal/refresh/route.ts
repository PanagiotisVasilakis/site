import { NextRequest, NextResponse } from 'next/server';
import { ApiError, ApiErrorCode, withErrorHandler, createSuccessResponse as success } from '@/lib/apiErrorHandler';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import { guestStore } from '@/lib/guestDataStore';
import {
  createSessionCookie,
  createRefreshCookie,
  clearSessionCookie,
  clearRefreshCookie,
  GUEST_REFRESH_COOKIE,
  GUEST_SESSION_COOKIE,
  parseGuestSessionBinding,
} from '@/lib/guestSession';
import { logger as elogger } from '@/lib/logger-enterprise';
import { requestAuthContext } from '@/lib/portalAuthHttp';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';

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

function unauthorizedResponse(): NextResponse {
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
    presented_session: parseGuestSessionBinding(
      request.cookies.get(GUEST_SESSION_COOKIE)?.value,
    ),
  });
  if (rotated.status === 'concurrent') {
    elogger.info('refresh_token.concurrent', {
      correlationId: elogger.getContext()?.correlationId,
    });
    return { status: 'concurrent' };
  }

  if (rotated.status === 'replayed') {
    elogger.warn('refresh_token.replay_detected', {
      correlationId: elogger.getContext()?.correlationId,
    });
    return { status: 'failed' };
  }

  if (rotated.status !== 'rotated'
    || !rotated.old
    || !rotated.rec
    || !rotated.token
    || !rotated.session
    || !rotated.sessionToken) {
    return { status: 'failed' };
  }

  elogger.info('refresh_token.rotated', {
    correlationId: elogger.getContext()?.correlationId,
    user_id: rotated.old.user_id,
    old_id: rotated.old.id,
    new_id: rotated.rec.id,
    family_id: rotated.rec.family_id,
  });

  return {
    status: 'refreshed',
    jwt: rotated.sessionToken,
    refreshToken: rotated.token,
  };
}

// The caller (src/lib/portalRefreshClient.ts) navigates to its validated `next`
// itself. The route never redirects: an absolute Location built from req.url
// would carry the server bind host (0.0.0.0 / localhost), not the public host.
export const POST = withErrorHandler(async (req: NextRequest) => {
  // No token rotation while the portal is switched off (same 404 as its other routes).
  if (!(await getFeatureFlagsAsync()).portalEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  const refresh = req.cookies.get(GUEST_REFRESH_COOKIE)?.value;
  if (!refresh) {
    return unauthorizedResponse();
  }

  // The limit is per client address only: a constant identifier would put every guest into one shared
  // bucket. It runs after the cookie check, so requests without a cookie write nothing.
  const rateLimit = await checkSensitiveRateLimit(req, {
    scope: 'portal-refresh',
    limit: 60,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) {
    throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many refresh attempts');
  }

  const refreshed = await issueRefreshedSession(req, refresh);
  if (refreshed.status === 'concurrent') {
    return concurrentRefreshResponse();
  }
  if (refreshed.status === 'failed') {
    return unauthorizedResponse();
  }
  const res = success({ refreshed: true });
  applyAuthCookies(res, refreshed.jwt, refreshed.refreshToken);
  return res;
});
