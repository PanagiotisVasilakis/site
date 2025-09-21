import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { guestStore } from '@/lib/guestDataStore';
import { createSessionCookieWithMaxAge, signGuestSession, hasVerifiedBookingSession, getGuestSessionFromCookies } from '@/lib/guestSession';
import { locales, defaultLocale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

// POST /api/bookings/:id/confirm
// On success: mint booking-scoped session (HttpOnly, Secure), 303 to /{locale}/check-in?bookingId=:id
// Idempotent: if already confirmed or session exists for this booking, still 303.
export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
  const guard = createAPISecurityMiddleware();
  const early = guard(request);
  if (early) return early;

  const { id } = await params;
  const bookingId = typeof id === 'string' ? id.trim() : '';
  if (!bookingId || bookingId.length > 128 || /[^a-zA-Z0-9_\-]/.test(bookingId)) {
    throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Invalid booking id');
  }

  // Lookup booking
  const booking = guestStore.findBookingById(bookingId);
  if (!booking) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Booking not found');
  }

  // Determine effective locale from cookie
  const lang = request.cookies.get('lang')?.value;
  const effLocale = lang && (locales as readonly string[]).includes(lang) ? lang : (defaultLocale as string);
  const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const location = new URL(`/${effLocale}/check-in?bookingId=${encodeURIComponent(bookingId)}`, origin).toString();

  // If we already have a verified session, just redirect idempotently
  const existing = await getGuestSessionFromCookies();
  if (hasVerifiedBookingSession(existing)) {
    const res = NextResponse.redirect(location, 303);
    return res;
  }

  // Ensure we have a user linked to booking to grant access; if not, keep idempotent behavior but skip session.
  if (!booking.user_id) {
    // No user to bind session; still redirect to check-in where guard will handle authorization.
    return NextResponse.redirect(location, 303);
  }

  // Grant access and mint a short-lived session (e.g., 30 minutes)
  guestStore.setAccess(booking.user_id, booking.id, 'VERIFIED');
  const jwt = signGuestSession({ user: { id: booking.user_id }, booking: { id: booking.id } }, '30m');
  const cookie = createSessionCookieWithMaxAge(jwt, 30 * 60);

  const res = NextResponse.redirect(location, 303);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
});
