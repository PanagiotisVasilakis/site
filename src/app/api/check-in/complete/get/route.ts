import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { getGuestSessionFromCookies, hasVerifiedBookingSession } from '@/lib/guestSession';
import { guestStore } from '@/lib/guestDataStore';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: NextRequest) => {
  void req;
  const session = await getGuestSessionFromCookies();
  if (!hasVerifiedBookingSession(session) || !session?.booking?.id) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Not authorized');
  }
  const rec = guestStore.getCheckinCompletionByBooking(session.booking.id);
  return createSuccessResponse({
    completion: rec ? { arrivalTime: rec.arrival_time, specialRequests: rec.special_requests, acceptedAt: rec.accepted_at } : null,
  }) as NextResponse;
});
