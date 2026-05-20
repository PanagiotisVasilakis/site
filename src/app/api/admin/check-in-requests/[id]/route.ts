import { NextRequest } from 'next/server';
import { z } from 'zod';
import { CheckInRequestStatus } from '@/generated/prisma/client';
import { withErrorHandler, validateRequestBody, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import { isAdminRequest } from '@/lib/rbac';
import { checkInRequestRepository } from '@/lib/prisma-repositories/checkInRequestRepository';

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

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  const earlyResponse = guard(request);
  if (earlyResponse) return earlyResponse;

  if (!isAdminRequest(request)) {
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

  const notification: { status: NotificationStatus } = {
    status: 'skipped',
  };

  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse({
    request: {
      id: requestAfterUpdate.id,
      status: requestAfterUpdate.status.toLowerCase(),
    },
    notification,
  }, undefined, correlationId);
});
