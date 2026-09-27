import { NextRequest } from 'next/server';
import { ApiError, ApiErrorCode, createSuccessResponse, withErrorHandler } from '@/lib/apiErrorHandler';
import { adminListPageArgs, adminListPageQuerySchema, toAdminListPage } from '@/lib/adminListPage';
import { prisma } from '@/lib/prisma';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const allowedStatuses = new Set(['PENDING', 'DELIVERED', 'DELIVERY_FAILED', 'CLOSED']);

export const GET = withErrorHandler(async (request: NextRequest) => {
  if (!(await isAdminRequest(request))) throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
  const { searchParams } = request.nextUrl;
  const requestedStatus = searchParams.get('status')?.toUpperCase();
  const status = requestedStatus && allowedStatuses.has(requestedStatus) ? requestedStatus : undefined;
  const { limit = 200, cursor } = adminListPageQuerySchema.parse({
    limit: searchParams.get('limit') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
  });
  const where = status ? { status: status as 'PENDING' | 'DELIVERED' | 'DELIVERY_FAILED' | 'CLOSED' } : undefined;
  const [rows, total] = await Promise.all([
    prisma.stayRequest.findMany({
      where,
      ...adminListPageArgs(limit, cursor),
      include: { outboxEvents: { orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
    prisma.stayRequest.count({ where }),
  ]);
  const page = toAdminListPage(rows, limit, cursor);
  return createSuccessResponse({ requests: page.items, total, nextCursor: page.nextCursor });
});
