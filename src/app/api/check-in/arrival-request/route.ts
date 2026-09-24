import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { GUEST_SESSION_COOKIE, parseGuestSession, verifyGuestSessionAccess, type GuestSessionPayload } from '@/lib/guestSession';
import { guestStore } from '@/lib/guestDataStore';
import { checkInRequestRepository, type CheckInRequestRecord } from '@/lib/prisma-repositories/checkInRequestRepository';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';

const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
  requestedTime: z.string().regex(timeRegex, 'Requested time must be in HH:MM format'),
  message: z.string().trim().max(500, 'Message must be 500 characters or fewer').optional(),
});

export const dynamic = 'force-dynamic';

function normalizeRequest(request: CheckInRequestRecord | undefined) {
  if (!request) return null;
  return {
    id: request.id,
    requestedTime: request.requested_time,
    message: request.message,
    status: request.status.toLowerCase(),
    createdAt: new Date(request.created_at).toISOString(),
    updatedAt: new Date(request.updated_at).toISOString(),
  };
}

async function getVerifiedSession(request: NextRequest): Promise<GuestSessionPayload> {
  const session = parseGuestSession(request.cookies.get(GUEST_SESSION_COOKIE)?.value);
  const verified = await verifyGuestSessionAccess(session);
  if (!verified) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Authentication required to request an arrival time');
  }
  return verified;
}

function safeUuid(value: string | undefined): string | undefined {
  return value && uuidRegex.test(value) ? value : undefined;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }

  const session = await getVerifiedSession(request);
  const latest = await checkInRequestRepository.findLatestForGuest({
    bookingId: safeUuid(session.booking?.id),
    userId: safeUuid(session.user?.id),
  });

  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse({ request: normalizeRequest(latest) }, undefined, correlationId);
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }

  const guard = createAPISecurityMiddleware();
  const early = await guard(request);
  if (early) return early;

  const session = await getVerifiedSession(request);
  const parseBody = validateRequestBody(requestSchema);
  const body = await parseBody(request);
  const message = body.message?.trim() || undefined;
  const user = session.user?.id ? await guestStore.findUserById(session.user.id) : undefined;

  const created = await checkInRequestRepository.create({
    bookingId: safeUuid(session.booking?.id),
    userId: safeUuid(session.user?.id),
    guestEmail: user?.email,
    guestPhone: user?.phone_e164,
    requestedTime: body.requestedTime,
    message,
  }, {
    eventType: 'check_in_time_request.created',
    nextStatus: 'PENDING',
  });
  const delivered = created.notificationEventId
    ? await (await import('@/lib/bookingOutbox')).deliverOutboxEvent(created.notificationEventId)
    : false;
  const notification = !created.created
    ? { status: 'skipped' as const, reason: 'request_already_pending' }
    : !created.notificationEventId
    ? { status: 'skipped' as const, reason: 'webhook_not_configured' }
    : { status: delivered ? 'sent' as const : 'queued' as const };

  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse({ request: normalizeRequest(created.request), notification }, undefined, correlationId);
});
