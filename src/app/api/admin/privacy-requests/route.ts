import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, ApiErrorCode, createSuccessResponse, readJsonBody, ValidationError, withErrorHandler } from '@/lib/apiErrorHandler';
import { completeErasureRequest } from '@/lib/privacyService';
import { prisma } from '@/lib/prisma';
import { isAdminRequest } from '@/lib/rbac';

async function requireAdmin(request: NextRequest) {
  if (!(await isAdminRequest(request))) throw new ApiError(ApiErrorCode.FORBIDDEN, 'Admin credentials required');
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  const status = request.nextUrl.searchParams.get('status');
  const allowed = ['PENDING', 'VERIFIED', 'COMPLETED', 'REJECTED'] as const;
  if (status && !allowed.includes(status as typeof allowed[number])) {
    throw new ApiError(ApiErrorCode.VALIDATION_ERROR, 'Invalid privacy request status');
  }
  const requests = await prisma.privacyRequest.findMany({
    where: status ? { status: status as typeof allowed[number] } : undefined,
    orderBy: { requestedAt: 'asc' },
  });
  return createSuccessResponse({ requests });
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('complete_erasure'), requestId: z.string().uuid(), auditNote: z.string().trim().min(3).max(1_024) }),
  z.object({ action: z.literal('reject'), requestId: z.string().uuid(), auditNote: z.string().trim().min(3).max(1_024) }),
  z.object({
    action: z.literal('add_hold'),
    userId: z.string().uuid().optional(),
    bookingId: z.string().uuid().optional(),
    reason: z.string().trim().min(3).max(512),
    expiresAt: z.string().datetime().optional(),
  }).refine((value) => Number(Boolean(value.userId)) + Number(Boolean(value.bookingId)) === 1, 'Exactly one subject is required'),
  z.object({ action: z.literal('release_hold'), holdId: z.string().uuid() }),
]);

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  const parsed = actionSchema.safeParse(await readJsonBody(request, 16 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const input = parsed.data;

  if (input.action === 'complete_erasure') {
    try {
      return createSuccessResponse({ request: await completeErasureRequest(input.requestId, input.auditNote) });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'ERASURE_BLOCKED_BY_ACTIVE_HOLD') throw new ApiError(ApiErrorCode.CONFLICT, 'Erasure is blocked by an active privacy hold');
      if (code === 'ERASURE_REQUEST_NOT_FOUND' || code === 'ERASURE_SUBJECT_NOT_FOUND') throw new ApiError(ApiErrorCode.NOT_FOUND, 'Erasure request or subject not found');
      if (code === 'ERASURE_REQUEST_NOT_VERIFIED') throw new ApiError(ApiErrorCode.CONFLICT, 'Erasure request is not verified');
      throw error;
    }
  }
  if (input.action === 'reject') {
    const updated = await prisma.privacyRequest.updateMany({
      where: { id: input.requestId, status: { in: ['PENDING', 'VERIFIED'] } },
      data: { status: 'REJECTED', completedAt: new Date(), auditNote: input.auditNote },
    });
    if (updated.count !== 1) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Open privacy request not found');
    return createSuccessResponse({ rejected: true, requestId: input.requestId });
  }
  if (input.action === 'add_hold') {
    const hold = await prisma.privacyHold.create({
      data: {
        id: crypto.randomUUID(),
        userId: input.userId ?? null,
        bookingId: input.bookingId ?? null,
        reason: input.reason,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    return createSuccessResponse({ hold }, 201);
  }
  const released = await prisma.privacyHold.updateMany({
    where: { id: input.holdId, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  if (released.count !== 1) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Active privacy hold not found');
  return createSuccessResponse({ released: true, holdId: input.holdId });
});
