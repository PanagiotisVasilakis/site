import { NextRequest } from 'next/server';

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
  createRatePeriod,
  listRatePeriods,
  RatePeriodOverlapError,
  ratePeriodInputSchema,
} from '@/lib/prisma-repositories/ratePeriodRepository';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Seasonal nightly prices set by the host. A rate period is
// { id, startDate, endDate, nightlyPriceCents, minimumNights }: dates are ISO
// 'YYYY-MM-DD' calendar dates and endDate is EXCLUSIVE (the period covers the
// nights startDate..endDate-1, so [a, b) and [b, c) do not overlap); prices are
// integer euro cents. Periods may not overlap (409).

export const GET = withErrorHandler(async (request: NextRequest) => {
  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
  }

  return createSuccessResponse({ ratePeriods: await listRatePeriods() });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
  }
  const origin = request.headers.get('origin');
  if (origin && !isSameOriginRequest(origin, request)) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Cross-origin admin mutation rejected');
  }

  const parsed = ratePeriodInputSchema.safeParse(await readJsonBody(request, 4 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  try {
    return createSuccessResponse({ ratePeriod: await createRatePeriod(parsed.data) }, 201);
  } catch (error) {
    if (error instanceof RatePeriodOverlapError) {
      throw new ApiError(ApiErrorCode.CONFLICT, 'The dates overlap an existing rate period');
    }
    throw error;
  }
});
