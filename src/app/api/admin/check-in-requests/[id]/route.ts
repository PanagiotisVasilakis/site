import { NextRequest } from 'next/server';
import { z } from 'zod';
import { CheckInRequestStatus } from '@/generated/prisma/client';
import { withErrorHandler, validateRequestBody, createSuccessResponse, requireAdminRequest, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import {
  CheckInRequestAlreadyDecidedError,
  CheckInRequestNotFoundError,
  checkInRequestRepository,
  deliverCheckInNotification,
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
  await requireAdminRequest(request, { sameOrigin: true });

  const params = await context.params;
  if (!idSchema.safeParse(params.id).success) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Check-in request not found');
  const id = params.id;
  const body = await validateRequestBody(bodySchema, 4 * 1_024)(request);

  const existing = await checkInRequestRepository.findById(id);
  if (!existing) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Check-in request not found');

  if ('action' in body) {
    const retried = await checkInRequestRepository.retryFailedNotifications(id);
    if (retried === 0) throw new ApiError(ApiErrorCode.CONFLICT, 'No failed notification is available to retry');
    return createSuccessResponse({
      request: { id: existing.id, status: existing.status.toLowerCase() },
      notification: { status: 'queued' as const },
    });
  }

  const nextStatus = statusMap[body.status];
  if (existing.status === nextStatus) {
    return createSuccessResponse({
      request: { id: existing.id, status: existing.status.toLowerCase() },
      notification: { status: 'skipped' as const, reason: 'status_unchanged' },
    });
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
  // The decision and its outbox event are committed: the immediate delivery is best-effort and the outbox worker retries it.
  const notification = await deliverCheckInNotification(
    update.notificationEventId,
    update.changed,
    'status_unchanged',
  );

  return createSuccessResponse({
    request: {
      id: update.request.id,
      status: update.request.status.toLowerCase(),
    },
    notification,
  });
});
