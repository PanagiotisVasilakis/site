import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { getGuestSessionFromCookies, hasVerifiedBookingSession } from '@/lib/guestSession';
import { guestStore, Booking } from '@/lib/guestDataStore';
import { getFeatureFlags } from '@/lib/featureFlags';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: NextRequest) => {
  void req; // silence unused param warning
  const flags = getFeatureFlags();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  const session = await getGuestSessionFromCookies();
  if (!hasVerifiedBookingSession(session)) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Not authorized');
  }
  // Hydrate booking details from store (dates/reference) if possible
  let booking: { id?: string; reference?: string; start_date?: string; end_date?: string; source?: Booking['source'] } | undefined = session?.booking as { id?: string } | undefined;
  let completion: { arrivalTime: string; specialRequests?: string; acceptedAt: number } | null = null;
  if (booking?.id) {
    const b = await guestStore.findBookingById(booking.id as string);
    if (b) {
      booking = { ...booking, reference: b.reference, start_date: b.start_date, end_date: b.end_date, source: b.source };
    }
  const c = await guestStore.getCheckinCompletionByBooking(booking.id as string);
    if (c) completion = { arrivalTime: c.arrival_time, specialRequests: c.special_requests, acceptedAt: c.accepted_at };
  }
  const payload = { user: session?.user, booking, completion };
  return createSuccessResponse(payload) as NextResponse;
});