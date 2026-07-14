import { NextRequest } from 'next/server';
import { z } from 'zod';
import { CheckInRequestStatus } from '@/generated/prisma/client';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { isAdminRequest } from '@/lib/rbac';
import { CheckInRequestNotFoundError, checkInRequestRepository } from '@/lib/prisma-repositories/checkInRequestRepository';

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
  if (!existing) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Check-in request not found');
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
