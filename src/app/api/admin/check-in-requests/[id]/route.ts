import { NextRequest } from 'next/server';
import { z } from 'zod';
import { CheckInRequestStatus } from '@/generated/prisma/client';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { isAdminRequest } from '@/lib/rbac';
import { checkInRequestRepository, type CheckInRequestRecord } from '@/lib/prisma-repositories/checkInRequestRepository';
import { logger } from '@/lib/logger-enterprise';

export const dynamic = 'force-dynamic';

const guard = createAPISecurityMiddleware();
const idSchema = z.string().uuid();
const updateSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

const statusMap: Record<z.infer<typeof updateSchema>['status'], CheckInRequestStatus> = {
  approved: CheckInRequestStatus.APPROVED,
  rejected: CheckInRequestStatus.REJECTED,
};

type NotificationStatus = 'sent' | 'skipped' | 'failed';

async function notifyStatusUpdate(payload: {
  request: CheckInRequestRecord;
  previousStatus: CheckInRequestStatus;
}): Promise<{ status: NotificationStatus; reason?: string }> {
  const webhookUrl = process.env.CHECKIN_REQUEST_WEBHOOK_URL;
  if (!webhookUrl) {
    return { status: 'skipped', reason: 'webhook_not_configured' };
  }

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = process.env.CHECKIN_REQUEST_WEBHOOK_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: 'check_in_time_request.updated',
        requestId: payload.request.id,
        bookingId: payload.request.booking_id,
        userId: payload.request.user_id,
        guestName: payload.request.guest_name,
        guestEmail: payload.request.guest_email,
        guestPhone: payload.request.guest_phone,
        requestedTime: payload.request.requested_time,
        message: payload.request.message,
        previousStatus: payload.previousStatus,
        status: payload.request.status,
        updatedAt: new Date(payload.request.updated_at).toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn('Check-in request status webhook returned non-OK status', {
        requestId: payload.request.id,
        status: response.status,
      });
      return { status: 'failed', reason: `webhook_status_${response.status}` };
    }

    return { status: 'sent' };
  } catch (error) {
    logger.warn('Check-in request status webhook failed', {
      requestId: payload.request.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed', reason: 'webhook_error' };
  }
}

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  const earlyResponse = guard(request);
  if (earlyResponse) return earlyResponse;

  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required');
  }

  const params = await context.params;
  const id = idSchema.parse(params.id);
  const body = await validateRequestBody(updateSchema)(request);
  const nextStatus = statusMap[body.status];

  const existing = await checkInRequestRepository.findById(id);
  if (!existing) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Check-in request not found');
  }

  const requestAfterUpdate = existing.status === nextStatus
    ? existing
    : await checkInRequestRepository.updateStatus(id, nextStatus);

  const notification = existing.status === nextStatus
    ? { status: 'skipped' as const, reason: 'status_unchanged' }
    : await notifyStatusUpdate({
        request: requestAfterUpdate,
        previousStatus: existing.status,
      });

  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse({
    request: {
      id: requestAfterUpdate.id,
      status: requestAfterUpdate.status.toLowerCase(),
    },
    notification,
  }, undefined, correlationId);
});
