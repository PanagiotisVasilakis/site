import { NextRequest } from 'next/server';
import { ApiError, ApiErrorCode, createSuccessResponse, withErrorHandler } from '@/lib/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const allowedStatuses = new Set(['PENDING', 'DELIVERED', 'DELIVERY_FAILED', 'CLOSED']);

export const GET = withErrorHandler(async (request: NextRequest) => {
  if (!(await isAdminRequest(request))) throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required');
  const requestedStatus = request.nextUrl.searchParams.get('status')?.toUpperCase();
  const status = requestedStatus && allowedStatuses.has(requestedStatus) ? requestedStatus : undefined;
  const requests = await prisma.stayRequest.findMany({
    where: status ? { status: status as 'PENDING' | 'DELIVERED' | 'DELIVERY_FAILED' | 'CLOSED' } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { outboxEvents: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return createSuccessResponse({ requests });
});
