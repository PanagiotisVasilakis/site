import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { guestStore } from '@/lib/guestDataStore';
import { createRefreshCookie, createSessionCookie, signGuestSession } from '@/lib/guestSession';
import { locales, defaultLocale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

// For on-site bookings, the POS passes minimal required data
const schema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
  origin: z.enum(['GR', 'ABROAD']).optional(),
  booking: z.object({
    id: z.string().optional(),
    reference: z.string().optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lastName: z.string().optional(),
  }),
  remember: z.boolean().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  // Security checks (content type, XSS/SQLi). No API key by default; enable via middleware options if desired.
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
    // Helper to read either flat or bracketed names
    const get = (k: string, alt?: string) => (fd.get(k) ?? (alt ? fd.get(alt) : null));
    const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : v ? String(v) : undefined);
    const bool = (v: FormDataEntryValue | null) => {
      const s = str(v)?.toLowerCase();
      return s === '1' || s === 'true' || s === 'on' ? true : s === '0' || s === 'false' ? false : undefined;
    };
    const parsed = {
      phone: str(get('phone')),
      origin: (str(get('origin')) as 'GR' | 'ABROAD' | undefined),
      booking: {
        id: str(get('booking[id]', 'booking_id')),
        reference: str(get('booking[reference]', 'booking_reference')),
        start_date: str(get('booking[start_date]', 'booking_start_date')),
        end_date: str(get('booking[end_date]', 'booking_end_date')),
        lastName: str(get('booking[lastName]', 'booking_lastName')),
      },
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
  const { user, booking } = await guestStore.registerOnsiteGuest({
    phone: body.phone,
    origin: body.origin || 'GR',
    booking: {
      id: body.booking.id,
      reference: body.booking.reference,
      lastName: body.booking.lastName,
      startDate: body.booking.start_date,
      endDate: body.booking.end_date,
    },
  });

  const jwt = signGuestSession({ user: { id: user.id }, booking: { id: booking.id } });
  const sess = createSessionCookie(jwt);

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