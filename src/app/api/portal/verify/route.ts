import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode, ValidationError } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { BookingAlreadyLinkedError, BookingNotFoundError, guestStore } from '@/lib/guestDataStore';
import { issueGuestSession, createSessionCookie, createRefreshCookie } from '@/lib/guestSession';
import { locales, defaultLocale } from '@/i18n/config';
import { logger as elogger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import { normalizePhone } from '@/lib/phone';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';

const phoneInput = z.string().trim().min(8).max(32);
const originEnum = z.enum(['GR', 'ABROAD']);
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);

// Sign-in schema: ONLY phone and password
const signInSchema = z.object({
  mode: z.literal('signin'),
  phone: phoneInput,
  password: passwordSchema,
  remember: z.boolean().optional(),
});

// Sign-up schema: all fields + password
const baseSignUpSchema = z.object({
  mode: z.literal('signup'),
  origin: originEnum,
  phone: phoneInput,
  password: passwordSchema,
  bookingRef: z.string().trim().min(3).max(64),
  lastName: z.string().trim().min(1).max(100),
  remember: z.boolean().optional(),
});

const signUpSchemaGR = baseSignUpSchema.extend({
  origin: z.literal('GR'),
  afm: z
    .string()
    .regex(/^\d{9}$/, 'AFM must contain exactly 9 digits'),
});

const signUpSchemaAbroad = baseSignUpSchema.extend({
  origin: z.literal('ABROAD'),
  passport: z.string().trim().regex(/^[A-Za-z0-9]{5,20}$/),
});

const signUpSchema = z.union([signUpSchemaGR, signUpSchemaAbroad]);

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (request: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.portalEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  // API security checks (content type, XSS/SQLi); no API key required for guest verify
  const guard = createAPISecurityMiddleware();
  const early = guard(request);
  if (early) return early;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw new ApiError(ApiErrorCode.BAD_REQUEST, 'Invalid JSON in request body');
  }

  const rawRecord = typeof rawBody === 'object' && rawBody !== null ? rawBody as Record<string, unknown> : {};
  const mode = rawRecord.mode === 'signin' ? 'signin' : 'signup';
  const schema = mode === 'signin' ? signInSchema : signUpSchema;
  const parseResult = schema.safeParse({ ...rawRecord, mode });
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.issues);
  }
  const body = parseResult.data;

  const rateLimit = await checkSensitiveRateLimit(request, {
    scope: body.mode === 'signin' ? 'portal-signin' : 'portal-signup',
    identifier: typeof body.phone === 'string' ? body.phone : undefined,
    limit: body.mode === 'signin' ? 5 : 3,
    windowMs: body.mode === 'signin' ? 15 * 60_000 : 60 * 60_000,
  });
  if (!rateLimit.allowed) {
    throw new ApiError(ApiErrorCode.RATE_LIMITED, 'Too many authentication attempts', {
      retryAfter: Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
    });
  }

  const lang = request.cookies.get('lang')?.value;
  const effLocale = lang && (locales as readonly string[]).includes(lang) ? lang : (defaultLocale as string);

  // **SIGN-IN MODE**: Only phone + password
  if (body.mode === 'signin') {
    const normalizedPhone = normalizePhone(body.phone);
    if (!normalizedPhone) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Invalid phone number or password');
    }
    // Find user by phone
    const user = await guestStore.findUserByPhone(normalizedPhone.e164);
    if (!user || !user.password_hash) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Invalid phone number or password');
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(body.password, user.password_hash);
    if (!passwordMatch) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Invalid phone number or password');
    }

    // Find an eligible booking for this user
    const booking = await guestStore.findEligibleBookingForUser(user.id);
    if (!booking) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'No active booking found for this account');
    }

    // Issue session
    const token = await issueGuestSession(user.id, booking.id);
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
      const issued = await guestStore.issueRefreshToken(user.id, 30); // 30 days
      const rtCookie = createRefreshCookie(issued.token);
      res.cookies.set(rtCookie.name, rtCookie.value, rtCookie.options);
    }

    return res;
  }

  // **SIGN-UP MODE**: All fields + password
  const normalizedPhone = normalizePhone(body.phone, body.origin);
  if (!normalizedPhone) {
    throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Invalid phone number');
  }

  // A public signup can only claim a reservation that already exists.
  const existingBooking = await guestStore.findBookingByReferenceAndLastName(body.bookingRef, body.lastName);
  if (!existingBooking) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Unable to verify reservation details');
  }

  // Resolve existing user and reconcile password state
  const user = await guestStore.findUserByPhone(normalizedPhone.e164);

  if (user && !user.password_hash) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Existing account requires password verification', {
      fields: { password: 'This phone number is already linked to an account without password sign-in. Please contact support.' }
    });
  } else if (user) {
    const matches = await bcrypt.compare(body.password, user.password_hash!);
    if (!matches) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Incorrect password for existing account', {
        fields: { password: 'Password does not match existing account. Please sign in or reset your password.' }
      });
    }
  }

  // Atomically link user to booking with identity verification and access grant
  const identityValue = body.origin === 'GR' ? body.afm : body.passport;
  const passwordHash = user ? undefined : await bcrypt.hash(body.password, 12);
  
  let booking;
  let linkedUserId: string;
  try {
    ({ booking, userId: linkedUserId } = await guestStore.linkUserToBookingWithAccess({
      userId: user?.id,
      newUser: passwordHash ? {
        phoneE164: normalizedPhone.e164,
        countryOrigin: body.origin,
        passwordHash,
      } : undefined,
      origin: body.origin,
      identityValue,
      bookingRef: body.bookingRef,
      lastName: body.lastName,
    }));
  } catch (error) {
    if (error instanceof BookingAlreadyLinkedError) {
      throw new ApiError(ApiErrorCode.CONFLICT, 'Booking is already linked to another account', {
        fields: {
          bookingRef: 'This booking is already linked to another guest account. Please contact support.',
        },
      });
    }
    if (error instanceof BookingNotFoundError) {
      throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Unable to verify reservation details');
    }
    throw error;
  }

  // Issue session
  const token = await issueGuestSession(linkedUserId, booking.id);
  const cookie = createSessionCookie(token);
  elogger.info('session.issued', { correlationId: elogger.getContext()?.correlationId, user_id: linkedUserId, booking_id: booking.id, source: booking.source, remember: !!body.remember });
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
    const issued = await guestStore.issueRefreshToken(linkedUserId, 30); // 30 days
    const rtCookie = createRefreshCookie(issued.token);
    res.cookies.set(rtCookie.name, rtCookie.value, rtCookie.options);
  }

  return res;
});
