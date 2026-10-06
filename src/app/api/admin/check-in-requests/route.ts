import { NextRequest } from 'next/server';
import { z } from 'zod';
import { CheckInRequestStatus } from '@/generated/prisma/client';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { isAdminRequest } from '@/lib/rbac';
import { adminListPageQuerySchema } from '@/lib/adminListPage';
import { checkInRequestRepository, type CheckInRequestRecord } from '@/lib/prisma-repositories/checkInRequestRepository';

export const dynamic = 'force-dynamic';

const statusFilterSchema = z.enum(['pending', 'approved', 'rejected', 'all']);

type RequestStatusFilter = z.infer<typeof statusFilterSchema>;

const statusMap: Record<Exclude<RequestStatusFilter, 'all'>, CheckInRequestStatus> = {
  pending: CheckInRequestStatus.PENDING,
  approved: CheckInRequestStatus.APPROVED,
  rejected: CheckInRequestStatus.REJECTED,
};

function serializeRequest(request: CheckInRequestRecord) {
  return {
    id: request.id,
    bookingId: request.booking_id,
    userId: request.user_id,
    guestName: request.guest_name,
    guestEmail: request.guest_email,
    guestPhone: request.guest_phone,
    requestedTime: request.requested_time,
    message: request.message,
    status: request.status.toLowerCase(),
    notificationStatus: request.notification_status?.toLowerCase() ?? null,
    createdAt: new Date(request.created_at).toISOString(),
    updatedAt: new Date(request.updated_at).toISOString(),
  };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
  }

  const { searchParams } = new URL(request.url);
  const filter = statusFilterSchema.parse(searchParams.get('status') ?? 'pending');
  const status = filter === 'all' ? undefined : statusMap[filter];
  const page = adminListPageQuerySchema.parse({
    limit: searchParams.get('limit') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
  });

  const [{ requests, nextCursor }, summary] = await Promise.all([
    checkInRequestRepository.list({ status, ...page }),
    checkInRequestRepository.getStatusCounts(),
  ]);

  const correlationId = request.headers.get('x-correlation-id') ?? undefined;
  return createSuccessResponse({
    requests: requests.map(serializeRequest),
    summary,
    // Rows matching the filter, not only this page.
    total: filter === 'all' ? summary.total : summary[filter],
    nextCursor,
  }, undefined, correlationId);
});
