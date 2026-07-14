import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, ApiErrorCode, createSuccessResponse, withErrorHandler } from '@/lib/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';
const schema = z.object({ action: z.enum(['retry_delivery', 'close']) });

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  if (!(await isAdminRequest(request))) throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required');
  const { id } = context ? await context.params : { id: '' };
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Invalid action');
  const existing = await prisma.stayRequest.findUnique({ where: { id }, include: { outboxEvents: true } });
  if (!existing) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Stay request not found');

  if (body.data.action === 'retry_delivery') {
    const retryable = existing.outboxEvents.filter((event) => event.status === 'FAILED');
    if (retryable.length === 0) throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'No failed delivery is available to retry');
    await prisma.$transaction([
      prisma.webhookOutbox.updateMany({
        where: { stayRequestId: id, status: 'FAILED' },
        data: { status: 'PENDING', attemptCount: 0, nextAttemptAt: new Date(), lastError: null },
      }),
      prisma.stayRequest.update({ where: { id }, data: { status: 'PENDING' } }),
    ]);
  } else {
    if (existing.outboxEvents.some((event) => event.status === 'PENDING' || event.status === 'PROCESSING')) {
      throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'A request with pending delivery cannot be closed');
    }
    await prisma.stayRequest.update({ where: { id }, data: { status: 'CLOSED' } });
  }

  return createSuccessResponse({ id, action: body.data.action });
});
