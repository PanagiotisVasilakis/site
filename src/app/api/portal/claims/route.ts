import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, ApiErrorCode, createSuccessResponse, readJsonBody, ValidationError, withErrorHandler } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import { locales, defaultLocale } from '@/i18n/config';
import { PortalAuthError, consumeBookingClaimGrant } from '@/lib/portalAuthService';
import { attachPortalAuthCookies, requestAuthContext } from '@/lib/portalAuthHttp';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { logger } from '@/lib/logger-enterprise';

export const dynamic = 'force-dynamic';

const schema = z.object({
  claimToken: z.string().trim().min(32).max(256),
  origin: z.enum(['GR', 'ABROAD']),
  phone: z.string().trim().min(8).max(32),
  password: z.string().min(8).max(128),
  remember: z.boolean().optional().default(false),
  acceptTerms: z.literal(true),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!(await getFeatureFlagsAsync()).portalEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  const early = await createAPISecurityMiddleware()(request);
  if (early) return early;

  const parsed = schema.safeParse(await readJsonBody(request, 16 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const rateLimit = await checkSensitiveRateLimit(request, {
    scope: 'portal-claim',
    identifier: parsed.data.phone,
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rateLimit.allowed) throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many claim attempts');

  const authContext = requestAuthContext(request);
  let result: { userId: string; bookingId: string };
  try {
    result = await consumeBookingClaimGrant({
      token: parsed.data.claimToken,
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
  const locale = lang && (locales as readonly string[]).includes(lang) ? lang : String(defaultLocale);
  const response = createSuccessResponse({
    bookingId: result.bookingId,
    redirect: `/${locale}/check-in`,
  });
  await attachPortalAuthCookies(request, response, { ...result, remember: parsed.data.remember });
  return response;
});
