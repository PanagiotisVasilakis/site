import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
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
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);

// Sign-in schema: ONLY phone and password
const signInSchema = z.object({
  mode: z.literal('signin'),
  phone: phoneE164,
  password: passwordSchema,
  remember: z.boolean().optional(),
});

// Sign-up schema: all fields + password
const baseSignUpSchema = z.object({
  mode: z.literal('signup'),
  origin: originEnum,
  phone: phoneE164,
  password: passwordSchema,
  bookingRef: z.string().trim().min(3).max(64).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  remember: z.boolean().optional(),
});

const signUpSchemaGR = baseSignUpSchema.extend({
  origin: z.literal('GR'),
  afm: z.string().regex(/^\d{9}$/),
});

const signUpSchemaAbroad = baseSignUpSchema.extend({
  origin: z.literal('ABROAD'),
  passport: z.string().trim().regex(/^[A-Za-z0-9]{5,20}$/),
});

const signUpSchema = z.union([signUpSchemaGR, signUpSchemaAbroad]);
const unionSchema = z.union([signInSchema, signUpSchema]);

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

  const lang = request.cookies.get('lang')?.value;
  const effLocale = lang && (locales as readonly string[]).includes(lang) ? lang : (defaultLocale as string);

  // **SIGN-IN MODE**: Only phone + password
  if (body.mode === 'signin') {
    // Find user by phone
    const user = guestStore.findUserByPhone(body.phone);
    if (!user || !user.password_hash) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Invalid phone number or password', { 
        fields: { phone: 'No account found with this phone number' }
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(body.password, user.password_hash);
    if (!passwordMatch) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Invalid phone number or password', {
        fields: { password: 'Incorrect password' }
      });
    }

    // Find an eligible booking for this user
    const booking = guestStore.findEligibleBookingForUser(user.id);
    if (!booking) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'No active booking found for this account');
    }

    // Issue session
    const token = signGuestSession({ user: { id: user.id }, booking: { id: booking.id } });
    const cookie = createSessionCookie(token);
    elogger.info('session.issued', { correlationId: elogger.getContext()?.correlationId, user_id: user.id, booking_id: booking.id, source: 'signin', remember: !!body.remember });
    metrics.counter('session.issued', 1, { source: 'signin' });
    
    const res = createSuccessResponse({ redirect: `/${effLocale}/check-in`, bookingId: booking.id });
    res.cookies.set('portal_last_signin', '1', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 5 * 24 * 60 * 60,
    });
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    
    // Handle Remember Me with longer refresh token
    if (body.remember) {
      const issued = guestStore.issueRefreshToken(user.id, 30); // 30 days
      const rtCookie = createRefreshCookie(issued.token);
      res.cookies.set(rtCookie.name, rtCookie.value, rtCookie.options);
    }
    
    return res as NextResponse;
  }

  // **SIGN-UP MODE**: All fields + password
  // Check if user already exists
  let user = guestStore.findUserByPhone(body.phone);
  if (user && user.password_hash) {
    throw new ApiError(ApiErrorCode.CONFLICT, 'Account already exists with this phone number', {
      fields: { phone: 'This phone number is already registered. Please sign in instead.' }
    });
  }

  // Hash the password
  const saltRounds = 10;
  const password_hash = await bcrypt.hash(body.password, saltRounds);

  // Create or update user
  if (!user) {
    user = guestStore.createUser({
      phone_e164: body.phone,
      country_origin: body.origin,
      password_hash,
    });
  } else {
    // Update existing user with password
    user = guestStore.updateUserPassword(user.id, password_hash)!;
  }

  // Upsert identity
  if (body.origin === 'GR') {
    guestStore.upsertIdentity(user.id, 'AFM', body.afm);
  } else {
    guestStore.upsertIdentity(user.id, 'PASSPORT', body.passport);
  }

  // Booking lookup/link
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

  // Issue session
  const token = signGuestSession({ user: { id: user.id }, booking: { id: booking.id } });
  const cookie = createSessionCookie(token);
  elogger.info('session.issued', { correlationId: elogger.getContext()?.correlationId, user_id: user.id, booking_id: booking.id, source: booking.source, remember: !!body.remember });
  metrics.counter('session.issued', 1, { source: booking.source });
  
  const res = createSuccessResponse({ redirect: `/${effLocale}/check-in`, bookingId: booking.id });
  res.cookies.set('portal_last_signin', '1', {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 5 * 24 * 60 * 60,
  });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  
  // Handle Remember Me with longer refresh token
  if (body.remember) {
    const issued = guestStore.issueRefreshToken(user.id, 30); // 30 days
    const rtCookie = createRefreshCookie(issued.token);
    res.cookies.set(rtCookie.name, rtCookie.value, rtCookie.options);
  }
  
  return res as NextResponse;
});
