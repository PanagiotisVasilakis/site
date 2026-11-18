import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { GUEST_SESSION_COOKIE, parseGuestSession, verifyGuestSessionAccess, type GuestSessionPayload } from '@/lib/guestSession';
import { guestStore } from '@/lib/guestDataStore';
import {
  checkInRequestRepository,
  deliverCheckInNotification,
  type CheckInRequestRecord,
} from '@/lib/prisma-repositories/checkInRequestRepository';
import { getFeatureFlagsAsync } from '@/lib/featureFlags';
import { timePattern } from '@/lib/propertyTime';
import { createPortalBookingEligibilityWindow } from '@/lib/portalBookingEligibility';

const requestSchema = z.object({
  requestedTime: z.string().regex(timePattern, 'Requested time must be in HH:MM format'),
  message: z.string().trim().max(500, 'Message must be 500 characters or fewer').optional(),
}).strict();

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

const uuidSchema = z.uuid();

function safeUuid(value: string | undefined): string | undefined {
  return value && uuidSchema.safeParse(value).success ? value : undefined;
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

  return createSuccessResponse({ request: normalizeRequest(latest) });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const flags = await getFeatureFlagsAsync();
  if (!flags.checkinEnabled) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Not Found');
  }

  const session = await getVerifiedSession(request);
  const parseBody = validateRequestBody(requestSchema, 4 * 1_024);
  const body = await parseBody(request);
  const message = body.message?.trim() || undefined;

  // Allowed up to and including the check-in date (UTC calendar dates, as in portalBookingEligibility).
  const { prisma } = await import('@/lib/prisma');
  const booking = session.booking?.id
    ? await prisma.booking.findUnique({ where: { id: session.booking.id }, select: { startDate: true } })
    : null;
  const { businessToday } = createPortalBookingEligibilityWindow(new Date());
  if (!booking || booking.startDate.getTime() < businessToday.getTime()) {
    throw new ApiError(ApiErrorCode.CONFLICT, 'Arrival time requests are closed once the stay has started');
  }

  const user = session.user?.id ? await guestStore.findUserById(session.user.id) : undefined;

  const created = await checkInRequestRepository.create({
    bookingId: safeUuid(session.booking?.id),
    userId: safeUuid(session.user?.id),
    guestPhone: user?.phoneE164,
    requestedTime: body.requestedTime,
    message,
  }, {
    eventType: 'check_in_time_request.created',
    nextStatus: 'PENDING',
  });
  // The request and its outbox event are committed: the immediate delivery is best-effort and the outbox worker retries it.
  const notification = await deliverCheckInNotification(
    created.notificationEventId,
    created.created,
    'request_already_pending',
  );

  // 201 for a new request; 200 when the pending request was kept (nothing was created).
  return createSuccessResponse({ request: normalizeRequest(created.request), notification }, created.created ? 201 : 200);
});
