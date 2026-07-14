import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import {
  BookingAlreadyLinkedError,
  BookingNotFoundError,
  OnsiteGrantRejectedError,
  guestStore,
} from '@/lib/guestDataStore';
import { createRefreshCookie, createSessionCookie, issueGuestSession } from '@/lib/guestSession';
import { locales, defaultLocale } from '@/i18n/config';
import {
  isOnsiteConfirmationEnabled,
  readBearerToken,
  verifyOnsiteGrantToken,
} from '@/lib/onsiteGrant';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  phone: z.string().trim().min(8).max(32),
  origin: z.enum(['GR', 'ABROAD']).optional(),
  remember: z.boolean().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!isOnsiteConfirmationEnabled()) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }

  const bearer = readBearerToken(request.headers.get('authorization'));
  const grant = bearer ? verifyOnsiteGrantToken(bearer) : null;
  if (!grant) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'A valid onsite confirmation grant is required');
  }

  const rateLimit = await checkSensitiveRateLimit(request, {
    scope: 'onsite-confirm',
    identifier: grant.bookingId,
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) {
    throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many onsite confirmation attempts');
  }

  const guard = createAPISecurityMiddleware();
  const early = guard(request);
  if (early) return early;

  // Accept JSON and form-encoded payloads
  const contentType = request.headers.get('content-type') || '';
  let body: z.infer<typeof schema>;
  if (contentType.toLowerCase().includes('application/json')) {
    const parseBody = validateRequestBody(schema);
    body = await parseBody(request);
  } else if (contentType.toLowerCase().includes('application/x-www-form-urlencoded') || contentType.toLowerCase().includes('multipart/form-data')) {
    const fd = await request.formData();
    const get = (k: string) => fd.get(k);
    const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : v ? String(v) : undefined);
    const bool = (v: FormDataEntryValue | null) => {
      const s = str(v)?.toLowerCase();
      return s === '1' || s === 'true' || s === 'on' ? true : s === '0' || s === 'false' ? false : undefined;
    };
    const parsed = {
      phone: str(get('phone')),
      origin: (str(get('origin')) as 'GR' | 'ABROAD' | undefined),
      remember: bool(get('remember')),
    } as unknown;
    const res = schema.safeParse(parsed);
    if (!res.success) {
      throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Invalid booking confirmation payload', { issues: res.error.issues });
    }
    body = res.data;
  } else {
    // Fallback to JSON parsing error
    const parseBody = validateRequestBody(schema);
    body = await parseBody(request);
  }

  // Atomically register onsite guest with booking and access
  let user;
  let booking;
  try {
    ({ user, booking } = await guestStore.registerOnsiteGuest({
      phone: body.phone,
      origin: body.origin || 'GR',
      bookingId: grant.bookingId,
      grant: {
        jti: grant.jti,
        expiresAt: new Date(grant.exp * 1000),
      },
    }));
  } catch (error) {
    if (error instanceof BookingAlreadyLinkedError) {
      throw new ApiError(ApiErrorCode.CONFLICT, 'Booking is already linked to another account', {
        fields: {
          booking: 'This booking is already linked to another guest account. Please contact support.',
        },
      });
    }
    if (error instanceof BookingNotFoundError || error instanceof OnsiteGrantRejectedError) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Onsite confirmation grant is invalid or already used');
    }
    throw error;
  }

  const sessionJwt = await issueGuestSession(user.id, booking.id);
  const sess = createSessionCookie(sessionJwt);

  // Locale-aware redirect
  const lang = request.cookies.get('lang')?.value;
  const effLocale = lang && (locales as readonly string[]).includes(lang) ? lang : (defaultLocale as string);
  // Build a redirect response and set cookies directly.
  const redirectTo = `/${effLocale}/check-in?bookingId=${encodeURIComponent(booking.id)}`;
  const redirect = NextResponse.redirect(redirectTo, 302);
  redirect.cookies.set(sess.name, sess.value, sess.options);

  if (body.remember) {
    const issued = await guestStore.issueRefreshToken(user.id);
    const rtCookie = createRefreshCookie(issued.token);
    redirect.cookies.set(rtCookie.name, rtCookie.value, rtCookie.options);
  }

  return redirect;
});
