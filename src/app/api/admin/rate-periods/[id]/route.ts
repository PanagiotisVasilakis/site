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
import {
  deleteRatePeriod,
  RatePeriodNotFoundError,
  RatePeriodOverlapError,
  ratePeriodInputSchema,
  replaceRatePeriod,
} from '@/lib/prisma-repositories/ratePeriodRepository';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Replace or delete one rate period. Same contract as ../route.ts: ISO
// calendar dates with an EXCLUSIVE endDate, integer euro cents. A malformed id
// is answered like an unknown one (404), as in the other admin [id] routes.

async function authorizeMutation(
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
): Promise<string> {
  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
  }
  const origin = request.headers.get('origin');
  if (origin && !isSameOriginRequest(origin, request)) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Cross-origin admin mutation rejected');
  }
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(ApiErrorCode.NOT_FOUND, 'Rate period not found');
  return id;
}

function toApiError(error: unknown): unknown {
  if (error instanceof RatePeriodNotFoundError) return new ApiError(ApiErrorCode.NOT_FOUND, 'Rate period not found');
  if (error instanceof RatePeriodOverlapError) {
    return new ApiError(ApiErrorCode.CONFLICT, 'The dates overlap an existing rate period');
  }
  return error;
}

export const PUT = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => {
  const id = await authorizeMutation(request, context);

  const parsed = ratePeriodInputSchema.safeParse(await readJsonBody(request, 4 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  try {
    return createSuccessResponse({ ratePeriod: await replaceRatePeriod(id, parsed.data) });
  } catch (error) {
    throw toApiError(error);
  }
});

export const DELETE = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => {
  const id = await authorizeMutation(request, context);

  try {
    await deleteRatePeriod(id);
  } catch (error) {
    throw toApiError(error);
  }
  return createSuccessResponse({ id });
});
