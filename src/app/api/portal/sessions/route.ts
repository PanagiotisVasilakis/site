import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, ApiErrorCode, createSuccessResponse, readJsonBody, ValidationError, withErrorHandler } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import { locales, defaultLocale } from '@/i18n/config';
import { PortalAuthError, authenticatePortalUser } from '@/lib/portalAuthService';
import { attachPortalAuthCookies } from '@/lib/portalAuthHttp';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  phone: z.string().trim().min(8).max(32),
  password: z.string().min(8).max(128),
  remember: z.boolean().optional().default(false),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!(await getFeatureFlagsAsync()).portalEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  const early = createAPISecurityMiddleware()(request);
  if (early) return early;
  const parsed = schema.safeParse(await readJsonBody(request, 16 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const rateLimit = await checkSensitiveRateLimit(request, {
    scope: 'portal-session',
    identifier: parsed.data.phone,
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many sign-in attempts');

  let result: { userId: string; bookingId: string };
  try {
    result = await authenticatePortalUser(parsed.data);
  } catch (error) {
    if (error instanceof PortalAuthError) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Invalid phone number or password, or no eligible booking');
    }
    throw error;
  }

  const lang = request.cookies.get('lang')?.value;
  const locale = lang && (locales as readonly string[]).includes(lang) ? lang : String(defaultLocale);
  const response = createSuccessResponse({ bookingId: result.bookingId, redirect: `/${locale}/check-in` });
  await attachPortalAuthCookies(request, response, { ...result, remember: parsed.data.remember });
  return response;
});
