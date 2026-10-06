import { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  ApiError,
  ApiErrorCode,
  createSuccessResponse,
  readJsonBody,
  ValidationError,
  withErrorHandler,
} from '@/lib/apiErrorHandler';
import { isSameOriginRequest } from '@/lib/net/sameOrigin';
import { eraseGuestByAdmin } from '@/lib/privacyService';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const schema = z.object({
  confirm: z.literal(true),
  auditNote: z.string().trim().min(3).max(1_024),
}).strict();

// Right-to-erasure requests reach the host out of band; the host verifies the
// guest and executes the erasure here. The audit note is kept on the
// privacy request and the audit event records only a subject digest.
export const POST = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => {
  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
  }
  const origin = request.headers.get('origin');
  if (origin && !isSameOriginRequest(origin, request)) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Cross-origin admin mutation rejected');
  }
  const { userId } = await context.params;
  if (!z.uuid().safeParse(userId).success) {
    throw new ApiError(ApiErrorCode.NOT_FOUND, 'Guest not found');
  }
  const parsed = schema.safeParse(await readJsonBody(request, 4 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  try {
    const completed = await eraseGuestByAdmin(userId, parsed.data.auditNote);
    return createSuccessResponse({ requestId: completed.id, status: completed.status, completedAt: completed.completedAt });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ERASURE_BLOCKED_BY_ACTIVE_DELIVERY') {
      throw new ApiError(ApiErrorCode.CONFLICT, 'Erasure is blocked while a related webhook delivery is active; retry shortly');
    }
    if (code === 'ERASURE_REQUEST_NOT_VERIFIED') {
      throw new ApiError(ApiErrorCode.CONFLICT, 'The erasure request is not verified');
    }
    if (code === 'ERASURE_SUBJECT_NOT_FOUND' || code === 'ERASURE_REQUEST_NOT_FOUND') {
      throw new ApiError(ApiErrorCode.NOT_FOUND, 'Guest not found');
    }
    throw error;
  }
});
