import { NextRequest, NextResponse } from 'next/server';
import { guestStore } from '@/lib/guestDataStore';
import {
  createRefreshCookie,
  createSessionCookie,
  parseGuestSession,
  signGuestSession,
} from '@/lib/guestSession';
import { logger } from '@/lib/logger-enterprise';
import { locales, defaultLocale } from '@/i18n/config';

export const dynamic = 'force-dynamic';

type ConfirmBody = {
  lastName?: string;
  remember?: boolean;
};

function resolveLocale(request: NextRequest): string {
  const lang = request.cookies.get('lang')?.value;
  if (lang && (locales as readonly string[]).includes(lang)) {
    return lang;
  }
  return defaultLocale as string;
}

async function parseBody(request: NextRequest): Promise<ConfirmBody> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    try {
      const parsed = await request.json();
      return typeof parsed === 'object' && parsed !== null ? parsed as ConfirmBody : {};
    } catch {
      return {};
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    try {
      const form = await request.formData();
      const get = (key: string) => form.get(key);
      return {
        lastName: typeof get('lastName') === 'string' ? String(get('lastName')) : undefined,
        remember: (() => {
          const raw = get('remember');
          if (typeof raw === 'string') {
            const v = raw.toLowerCase();
            if (v === 'true' || v === '1' || v === 'on') return true;
            if (v === 'false' || v === '0' || v === 'off') return false;
          }
          return undefined;
        })(),
      };
    } catch {
      return {};
    }
  }

  return {};
}

type RouteParams = Record<string, string | string[] | undefined>;
type NextAppRouteContext = {
  params: Promise<unknown>;
};

export async function POST(request: NextRequest, context: NextAppRouteContext) {
  const params = await context.params;
  const rawBookingId = (params as RouteParams | undefined)?.id;
  const bookingId = Array.isArray(rawBookingId) ? rawBookingId[0] : rawBookingId;

  if (!bookingId) {
    return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
  }

  try {
    const body = await parseBody(request);
    const booking = await guestStore.findBookingById(bookingId);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const existingSession = parseGuestSession(request.cookies.get('guest_session')?.value);
    const sessionOwnsBooking = Boolean(
      existingSession?.booking?.id === booking.id
      && existingSession.user?.id
      && existingSession.user.id === booking.user_id
    );

    if (!sessionOwnsBooking) {
      const lastName = body.lastName?.trim();
      if (!lastName || !booking.reference) {
        return NextResponse.json({ error: 'Booking verification is required' }, { status: 401 });
      }

      const matching = await guestStore.findBookingByReferenceAndLastName(booking.reference, lastName);
      if (!matching || matching.id !== booking.id || matching.user_id !== booking.user_id) {
        return NextResponse.json({ error: 'Booking details do not match' }, { status: 403 });
      }
    }

    const userId = booking.user_id;

    if (!userId) {
      return NextResponse.json({ error: 'Booking is not linked to a user' }, { status: 409 });
    }

    await guestStore.setAccess(userId, booking.id, 'VERIFIED');

    const token = signGuestSession({ user: { id: userId }, booking: { id: booking.id } });
    const sessionCookie = createSessionCookie(token);
    const locale = resolveLocale(request);
    const redirectUrl = `/${locale}/check-in?bookingId=${encodeURIComponent(booking.id)}`;
    const response = new NextResponse(null, { status: 303 });
    response.headers.set('Location', redirectUrl);
    response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);

    if (body.remember) {
      try {
        const issued = await guestStore.issueRefreshToken(userId, 60);
        const refreshCookie = createRefreshCookie(issued.token);
        response.cookies.set(refreshCookie.name, refreshCookie.value, refreshCookie.options);
      } catch (error) {
        logger.warn('Failed to issue refresh token during booking confirmation', { error, bookingId, userId });
      }
    }

    return response;
  } catch (error) {
    logger.error('Failed to confirm booking', { error, bookingId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}