import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode, validateRequestBody } from '@/lib/apiErrorHandler';
import { getGuestSessionFromCookies, hasVerifiedBookingSession } from '@/lib/guestSession';
import { guestStore } from '@/lib/guestDataStore';
import { tracer, SpanStatus } from '@/lib/distributed-tracing';
import { metrics, trackApiCall } from '@/lib/metrics-collector';
import { getFeatureFlags } from '@/lib/featureFlags';

export const dynamic = 'force-dynamic';

const timeRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/; // HH:mm 00:00-23:59
const CompleteSchema = z.object({
  arrivalTime: z.string().regex(timeRegex, 'invalid_time').min(4).max(5),
  specialRequests: z.string().max(2000).optional().default(''),
  acceptTerms: z.boolean().refine(v => v === true, 'terms_required'),
});

// Dev-only persistence via store check-ins collection
function saveCompletion(bookingId: string, data: z.infer<typeof CompleteSchema>) {
  guestStore.upsertCheckinCompletion(bookingId, {
    arrival_time: data.arrivalTime,
    special_requests: data.specialRequests,
  });
  return true;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const flags = getFeatureFlags();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }
  const span = tracer.startSpan('checkin.complete.post');
  const start = Date.now();
  const parseBody = validateRequestBody(CompleteSchema);
  const body = await parseBody(req);
  const session = await getGuestSessionFromCookies();
  if (!hasVerifiedBookingSession(session) || !session?.booking?.id) {
    tracer.finishSpan(span, SpanStatus.ERROR);
    metrics.timer('api_checkin_complete_duration_ms', Date.now() - start, { endpoint: '/api/check-in/complete', method: 'POST', result: 'unauthorized' });
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Not authorized');
  }

  const ok = saveCompletion(session.booking.id, body);
  metrics.counter('api_checkin_complete_count', 1, { endpoint: '/api/check-in/complete', method: 'POST' });
  trackApiCall('/api/check-in/complete', 'POST', 200, Date.now() - start);
  tracer.finishSpan(span, ok ? SpanStatus.OK : SpanStatus.ERROR);
  metrics.timer('api_checkin_complete_duration_ms', Date.now() - start, { endpoint: '/api/check-in/complete', method: 'POST', result: ok ? 'ok' : 'error' });
  return createSuccessResponse({ ok: true }) as NextResponse;
});
