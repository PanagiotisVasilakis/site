import { NextRequest } from 'next/server';
import { z } from 'zod';
import { CheckInRequestStatus } from '@/generated/prisma/client';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { isAdminRequest } from '@/lib/rbac';
import {
  CheckInRequestAlreadyDecidedError,
  CheckInRequestNotFoundError,
  checkInRequestRepository,
} from '@/lib/prisma-repositories/checkInRequestRepository';

export const dynamic = 'force-dynamic';

const idSchema = z.uuid();
const updateSchema = z.object({
  status: z.enum(['approved', 'rejected']),
}).strict();
const retrySchema = z.object({ action: z.literal('retry_delivery') }).strict();
const bodySchema = z.union([retrySchema, updateSchema]);

const statusMap: Record<z.infer<typeof updateSchema>['status'], CheckInRequestStatus> = {
  approved: CheckInRequestStatus.APPROVED,
  rejected: CheckInRequestStatus.REJECTED,
};

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
  }

  const params = await context.params;
  const id = idSchema.parse(params.id);
  const body = await validateRequestBody(bodySchema, 4 * 1_024)(request);

  const existing = await checkInRequestRepository.findById(id);
  if (!existing) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Check-in request not found');

  if ('action' in body) {
    const retried = await checkInRequestRepository.retryFailedNotifications(id);
    if (retried === 0) throw new ApiError(ApiErrorCode.CONFLICT, 'No failed notification is available to retry');
    return createSuccessResponse({
      request: { id: existing.id, status: existing.status.toLowerCase() },
      notification: { status: 'queued' as const },
    }, undefined, request.headers.get('x-correlation-id') ?? undefined);
  }

  const nextStatus = statusMap[body.status];
  if (existing.status === nextStatus) {
    return createSuccessResponse({
      request: { id: existing.id, status: existing.status.toLowerCase() },
      notification: { status: 'skipped' as const, reason: 'status_unchanged' },
    }, undefined, request.headers.get('x-correlation-id') ?? undefined);
  }

  let update;
  try {
    update = await checkInRequestRepository.updateStatus(id, nextStatus);
  } catch (error) {
    if (error instanceof CheckInRequestNotFoundError) {
      throw new ApiError(ApiErrorCode.NOT_FOUND, 'Check-in request not found');
    }
    if (error instanceof CheckInRequestAlreadyDecidedError) {
      throw new ApiError(ApiErrorCode.CONFLICT, 'Only pending requests can be approved or rejected');
    }
    throw error;
  }
  const delivered = update.notificationEventId
    ? await (await import('@/lib/bookingOutbox')).deliverOutboxEvent(update.notificationEventId)
    : false;
  const notification = !update.changed
    ? { status: 'skipped' as const, reason: 'status_unchanged' }
    : !update.notificationEventId
      ? { status: 'skipped' as const, reason: 'webhook_not_configured' }
      : { status: delivered ? 'sent' as const : 'queued' as const };

  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse({
    request: {
      id: update.request.id,
      status: update.request.status.toLowerCase(),
    },
    notification,
  }, undefined, correlationId);
});
