import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  ApiError,
  ApiErrorCode,
  createSuccessResponse,
  readJsonBody,
  ValidationError,
  withErrorHandler,
} from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import {
  clearPresentedPortalClaimExchange,
  createPortalClaimExchangeCookie,
  setClaimTransportResponseHeaders,
} from '@/lib/portalClaimExchange';
import {
  PortalAuthError,
  prepareBookingClaimExchange,
} from '@/lib/portalAuthService';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  claimToken: z.string().trim().min(32).max(256),
});

const exchange = withErrorHandler(async (request: NextRequest) => {
  if (!(await getFeatureFlagsAsync()).portalEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  const early = await createAPISecurityMiddleware()(request);
  if (early) return early;

  const parsed = schema.safeParse(await readJsonBody(request, 4 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const rateLimit = await checkSensitiveRateLimit(request, {
    scope: 'portal-claim-exchange',
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!rateLimit.allowed) {
    throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many claim attempts');
  }

  try {
    const prepared = await prepareBookingClaimExchange(parsed.data.claimToken);
    const response = createSuccessResponse({ ready: true });
    const cookie = createPortalClaimExchangeCookie(prepared.tokenDigest, prepared.expiresAt);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    if (error instanceof PortalAuthError) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'The claim token is invalid');
    }
    throw error;
  }
});

export const POST = async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => {
  const response = await exchange(request, context);
  if (!response.ok) clearPresentedPortalClaimExchange(request, response);
  setClaimTransportResponseHeaders(response);
  return response;
};
