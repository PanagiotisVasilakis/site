import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { getVerifiedGuestSessionFromCookies } from '@/lib/guestSession';
import { guestStore, Booking } from '@/lib/guestDataStore';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: NextRequest) => {
  void req; // silence unused param warning
  const flags = await getFeatureFlagsAsync();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  const session = await getVerifiedGuestSessionFromCookies();
  if (!session) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Not authorized');
  }
  // Hydrate booking details from store (dates/reference) if possible
  let booking: {
    id?: string;
    reference?: string;
    start_date?: string;
    end_date?: string;
    source?: Booking['source'];
    status?: Booking['access_status'];
  } | undefined = session.booking;
  let completion: { arrivalTime: string; specialRequests?: string; acceptedAt: number } | null = null;
  if (booking?.id) {
    const bookingId = booking.id;
    const b = await guestStore.findBookingById(bookingId);
    if (b) {
      booking = {
        ...booking,
        reference: b.reference,
        start_date: b.start_date,
        end_date: b.end_date,
        source: b.source,
        status: b.access_status,
      };
    }
    const c = await guestStore.getCheckinCompletionByBooking(bookingId);
    if (c) completion = { arrivalTime: c.arrival_time, specialRequests: c.special_requests, acceptedAt: c.accepted_at };
  }
  const payload = { user: session?.user, booking, completion };
  return createSuccessResponse(payload) as NextResponse;
});
