import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { getVerifiedGuestSessionFromCookies } from '@/lib/guestSession';
import { guestStore } from '@/lib/guestDataStore';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: NextRequest) => {
  void req;
  const flags = await getFeatureFlagsAsync();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  const session = await getVerifiedGuestSessionFromCookies();
  if (!session?.booking?.id) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Not authorized');
  }
  const rec = await guestStore.getCheckinCompletionByBooking(session.booking.id);
  return createSuccessResponse({
    completion: rec ? { arrivalTime: rec.arrival_time, specialRequests: rec.special_requests, acceptedAt: rec.accepted_at } : null,
  }) as NextResponse;
});
