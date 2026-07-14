import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, ApiError, ApiErrorCode, createSuccessResponse, validateRequestBody } from '@/lib/apiErrorHandler';
import { issueGuestSession, createSessionCookie } from '@/lib/guestSession';
import { guestStore } from '@/lib/guestDataStore';

export const dynamic = 'force-dynamic';

const schema = z.object({
  userId: z.string().uuid(),
  bookingId: z.string().uuid(),
});

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const configuredSecret = process.env.DEV_SESSION_MINT_SECRET;
  const suppliedSecret = request.headers.get('x-dev-session-secret') || '';
  if (process.env.NODE_ENV === 'production'
    || process.env.DEV_SESSION_MINT_ENABLED !== '1'
    || !configuredSecret
    || !safeEqual(suppliedSecret, configuredSecret)) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }

  const body = await validateRequestBody(schema)(request);
  const [booking, access] = await Promise.all([
    guestStore.findBookingById(body.bookingId),
    guestStore.listAccessByUser(body.userId),
  ]);
  if (!booking
    || booking.user_id !== body.userId
    || !access.some((record) => record.booking_id === body.bookingId && record.status === 'VERIFIED')) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Verified booking access is required');
  }

  const token = await issueGuestSession(body.userId, body.bookingId);
  const cookieDef = createSessionCookie(token);
  const res = createSuccessResponse({ redirectedTo: '/check-in' });
  res.cookies.set(cookieDef.name, cookieDef.value, cookieDef.options);
  return res as NextResponse;
});
