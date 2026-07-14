import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { ApiError, ApiErrorCode, createSuccessResponse, readJsonBody, withErrorHandler } from '@/lib/apiErrorHandler';
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
  const body = schema.safeParse(await readJsonBody(request, 8 * 1_024));
  if (!body.success) throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Invalid action');
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.stayRequest.findUnique({ where: { id }, include: { outboxEvents: true } });
        if (!existing) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Stay request not found');

        if (body.data.action === 'retry_delivery') {
          const retried = await tx.outboxEvent.updateMany({
            where: { stayRequestId: id, status: 'DEAD' },
            data: {
              status: 'PENDING',
              attemptCount: 0,
              nextAttemptAt: new Date(),
              lastError: null,
              leaseOwner: null,
              leaseExpiresAt: null,
            },
          });
          if (retried.count === 0) {
            throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'No failed delivery is available to retry');
          }
          await tx.stayRequest.update({ where: { id }, data: { status: 'PENDING' } });
          return;
        }

        if (existing.outboxEvents.some((event) => event.status === 'PENDING' || event.status === 'LEASED')) {
          throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'A request with pending delivery cannot be closed');
        }
        await tx.stayRequest.update({ where: { id }, data: { status: 'CLOSED' } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      break;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 3) continue;
      throw error;
    }
  }

  return createSuccessResponse({ id, action: body.data.action });
});
