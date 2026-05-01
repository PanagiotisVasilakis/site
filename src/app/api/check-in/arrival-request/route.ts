import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { parseGuestSession, hasVerifiedBookingSession, type GuestSessionPayload } from '@/lib/guestSession';
import { guestStore } from '@/lib/guestDataStore';
import { checkInRequestRepository, type CheckInRequestRecord } from '@/lib/prisma-repositories/checkInRequestRepository';
import { logger } from '@/lib/logger-enterprise';

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

function getVerifiedSession(request: NextRequest): GuestSessionPayload {
  const session = parseGuestSession(request.cookies.get('guest_session')?.value);
  if (!session || !hasVerifiedBookingSession(session)) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Authentication required to request an arrival time');
  }
  return session;
}

function safeUuid(value: string | undefined): string | undefined {
  return value && uuidRegex.test(value) ? value : undefined;
}

async function notifyHost(payload: {
  request: CheckInRequestRecord;
  rawBookingId?: string;
  rawUserId?: string;
}): Promise<void> {
  const webhookUrl = process.env.CHECKIN_REQUEST_WEBHOOK_URL;
  if (!webhookUrl) return;

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = process.env.CHECKIN_REQUEST_WEBHOOK_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: 'check_in_time_request.created',
        requestId: payload.request.id,
        bookingId: payload.rawBookingId ?? payload.request.booking_id,
        userId: payload.rawUserId ?? payload.request.user_id,
        guestName: payload.request.guest_name,
        guestEmail: payload.request.guest_email,
        guestPhone: payload.request.guest_phone,
        requestedTime: payload.request.requested_time,
        message: payload.request.message,
        status: payload.request.status,
        createdAt: new Date(payload.request.created_at).toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn('Check-in request webhook returned non-OK status', {
        requestId: payload.request.id,
        status: response.status,
      });
    }
  } catch (error) {
    logger.warn('Check-in request webhook failed', {
      requestId: payload.request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = getVerifiedSession(request);
  const latest = await checkInRequestRepository.findLatestForGuest({
    bookingId: safeUuid(session.booking?.id),
    userId: safeUuid(session.user?.id),
  });

  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse({ request: normalizeRequest(latest) }, undefined, correlationId);
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const guard = createAPISecurityMiddleware();
  const early = guard(request);
  if (early) return early;

  const session = getVerifiedSession(request);
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
  });

  await notifyHost({
    request: created,
    rawBookingId: session.booking?.id,
    rawUserId: session.user?.id,
  });

  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse({ request: normalizeRequest(created) }, undefined, correlationId);
});
