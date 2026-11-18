import { NextRequest, NextResponse } from 'next/server';
import { ApiError, ApiErrorCode, withErrorHandler, createSuccessResponse } from '@/lib/apiErrorHandler';
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
import { logger } from '@/lib/logger-enterprise';
import { requestAuthContext } from '@/lib/portalAuthHttp';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';

function applyCookies(
  response: NextResponse,
  cookies: Array<ReturnType<typeof createSessionCookie>>,
): void {
  for (const cookie of cookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
}

function unauthorizedResponse(): NextResponse {
  const response = new NextResponse('Unauthorized', { status: 401 });
  applyCookies(response, [clearSessionCookie(), clearRefreshCookie()]);
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
    presented_session: parseGuestSessionBinding(
      request.cookies.get(GUEST_SESSION_COOKIE)?.value,
    ),
  });
  if (rotated.status === 'concurrent') {
    logger.info('refresh_token.concurrent', {
      correlationId: logger.getContext()?.correlationId,
    });
    return { status: 'concurrent' };
  }

  if (rotated.status === 'replayed') {
    logger.warn('refresh_token.replay_detected', {
      correlationId: logger.getContext()?.correlationId,
    });
    return { status: 'failed' };
  }

  if (rotated.status !== 'rotated') {
    return { status: 'failed' };
  }

  logger.info('refresh_token.rotated', {
    correlationId: logger.getContext()?.correlationId,
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
  const res = createSuccessResponse({ refreshed: true });
  applyCookies(res, [createSessionCookie(refreshed.jwt), createRefreshCookie(refreshed.refreshToken)]);
  return res;
});
