import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, ApiErrorCode, createSuccessResponse, readJsonBody, ValidationError, withErrorHandler } from '@/lib/apiErrorHandler';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import { normalizeLocale } from '@/i18n/config';
import { STAY_HUB_PATH } from '@/components/shell/shellLinks';
import { PortalAuthError, consumeBookingClaimGrant } from '@/lib/portalAuthService';
import {
  clearPresentedPortalClaimExchange,
  readPortalClaimExchange,
  setClaimTransportResponseHeaders,
} from '@/lib/portalClaimExchange';
import { attachPortalAuthCookies, requestAuthContext } from '@/lib/portalAuthHttp';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { logger } from '@/lib/logger-enterprise';

export const dynamic = 'force-dynamic';

const schema = z.object({
  origin: z.enum(['GR', 'ABROAD']),
  phone: z.string().trim().min(8).max(32),
  password: z.string().min(8).max(128),
  remember: z.boolean().optional().default(false),
  acceptTerms: z.literal(true),
}).strict();

const claim = withErrorHandler(async (request: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.portalEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  const parsed = schema.safeParse(await readJsonBody(request, 16 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  // The bucket follows the grant the caller proved it holds (read from the cookie, no database
  // access), not the phone: a caller without the exchange cookie only spends its own address budget.
  const tokenDigest = readPortalClaimExchange(request);
  const rateLimit = await checkSensitiveRateLimit(request, {
    scope: 'portal-claim',
    identifier: tokenDigest ?? undefined,
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rateLimit.allowed) throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many claim attempts');

  if (!tokenDigest) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'The claim token or account credentials are invalid');
  }
  const authContext = requestAuthContext(request);
  let result: { userId: string; bookingId: string };
  try {
    result = await consumeBookingClaimGrant({
      tokenDigest,
      phone: parsed.data.phone,
      origin: parsed.data.origin,
      password: parsed.data.password,
      correlationId: logger.getContext()?.correlationId,
      ipHash: authContext.ipHash,
    });
  } catch (error) {
    if (error instanceof PortalAuthError) {
      if (error.code === 'BOOKING_ALREADY_CLAIMED') {
        throw new ApiError(ApiErrorCode.CONFLICT, 'This booking is already linked to another account');
      }
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'The claim token or account credentials are invalid');
    }
    throw error;
  }

  const lang = request.cookies.get('lang')?.value;
  const locale = normalizeLocale(lang);
  // While check-in is off its page answers 404, so the guest lands on the stay hub instead.
  const redirect = flags.checkinEnabled ? `/${locale}/check-in` : `/${locale}${STAY_HUB_PATH}`;
  const response = createSuccessResponse({
    bookingId: result.bookingId,
    redirect,
  });
  await attachPortalAuthCookies(request, response, { ...result, remember: parsed.data.remember });
  return response;
});

export const POST = async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => {
  const response = await claim(request, context);
  clearPresentedPortalClaimExchange(request, response);
  setClaimTransportResponseHeaders(response);
  return response;
};
