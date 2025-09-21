import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { isValidAFM } from '@/lib/afm';
import { guestStore } from '@/lib/guestDataStore';
import { signGuestSession, createSessionCookie, createRefreshCookie } from '@/lib/guestSession';
import { locales, defaultLocale } from '@/i18n/config';
import { logger as elogger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { getFeatureFlags } from '@/lib/featureFlags';

const phoneE164 = z.string().regex(/^\+?[1-9]\d{7,14}$/); // basic E.164 (8-15 digits with leading +)
const originEnum = z.enum(['GR', 'ABROAD']);
const baseSchema = z.object({
  origin: originEnum,
  phone: phoneE164,
  bookingRef: z.string().trim().min(3).max(64).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  remember: z.boolean().optional(),
});

const schemaGR = baseSchema.extend({
  origin: z.literal('GR'),
  afm: z.string().regex(/^\d{9}$/),
});

const schemaAbroad = baseSchema.extend({
  origin: z.literal('ABROAD'),
  passport: z.string().trim().regex(/^[A-Za-z0-9]{5,20}$/),
});

const unionSchema = z.union([schemaGR, schemaAbroad]);

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const flags = getFeatureFlags();
  if (!flags.portalEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  // API security checks (content type, XSS/SQLi); no API key required for guest verify
  const guard = createAPISecurityMiddleware();
  const early = guard(request);
  if (early) return early;

  const parseBody = validateRequestBody(unionSchema);
  const body = await parseBody(request);

  // Server-side AFM checksum validation for Greece
  if (body.origin === 'GR') {
    if (!isValidAFM(body.afm)) {
      throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Invalid AFM');
    }
  }

  // Find or create user by phone
  const user = guestStore.findUserByPhone(body.phone) || guestStore.createUser({
    phone_e164: body.phone,
    country_origin: body.origin,
  });

  // Upsert identity
  if (body.origin === 'GR') {
    guestStore.upsertIdentity(user.id, 'AFM', body.afm);
  } else {
    guestStore.upsertIdentity(user.id, 'PASSPORT', body.passport);
  }

  // Booking lookup/link (MVP):
  // If bookingRef + lastName provided, try to find that exact booking; else link or create (external by ref, onsite otherwise).
  const nowISO = new Date().toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 2*24*60*60*1000).toISOString().slice(0, 10);
  let booking = body.bookingRef && body.lastName
    ? guestStore.findBookingByReferenceAndLastName(body.bookingRef, body.lastName)
    : undefined;
  if (!booking) {
    booking = guestStore.linkOrCreateBooking({
    source: body.bookingRef ? 'EXTERNAL' : 'ONSITE',
    reference: body.bookingRef,
    start_date: nowISO,
    end_date: endDate,
    user_id: user.id,
    last_name: body.lastName,
    });
  }

  // Grant access
  guestStore.setAccess(user.id, booking.id, 'VERIFIED');

  // Issue booking-scoped session immediately
  const token = signGuestSession({ user: { id: user.id }, booking: { id: booking.id } });
  const cookie = createSessionCookie(token);
  elogger.info('session.issued', { correlationId: elogger.getContext()?.correlationId, user_id: user.id, booking_id: booking.id, source: booking.source, remember: !!body.remember });
  metrics.counter('session.issued', 1, { source: booking.source });
  const lang = request.cookies.get('lang')?.value;
  const effLocale = lang && (locales as readonly string[]).includes(lang) ? lang : (defaultLocale as string);
  const res = createSuccessResponse({ redirect: `/${effLocale}/check-in`, bookingId: booking.id });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  if (body.remember) {
    const issued = guestStore.issueRefreshToken(user.id);
    const rtCookie = createRefreshCookie(issued.token);
    res.cookies.set(rtCookie.name, rtCookie.value, rtCookie.options);
  }
  return res as NextResponse;
});
