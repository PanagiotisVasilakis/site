import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { createAPISecurityMiddleware } from '@/lib/api-security-middleware';
import {
  ApiError,
  ApiErrorCode,
  createSuccessResponse,
  readJsonBody,
  ValidationError,
  withErrorHandler,
} from '@/lib/apiErrorHandler';
import { isSameOriginRequest } from '@/lib/net/sameOrigin';
import { prisma } from '@/lib/prisma';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Bookings created by the host in the admin UI. Calendar dates travel as
// `yyyy-MM-dd` and are stored as UTC midnight in the DATE columns, matching the
// UTC calendar-date convention of src/lib/portalBookingEligibility.ts.
const MANUAL_PROVIDER = 'manual';

const schema = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  source: z.enum(['ONSITE', 'EXTERNAL']).default('ONSITE'),
  externalReference: z.string().trim().min(1).max(128).optional(),
}).strict().refine((value) => value.endDate > value.startDate, {
  path: ['endDate'],
  message: 'Check-out must be after check-in',
});

const guard = createAPISecurityMiddleware();

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const early = await guard(request);
  if (early) return early;
  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
  }
  const origin = request.headers.get('origin');
  if (origin && !isSameOriginRequest(origin, request)) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Cross-origin admin mutation rejected');
  }

  const parsed = schema.safeParse(await readJsonBody(request, 4 * 1_024));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  try {
    const booking = await prisma.booking.create({
      data: {
        id: crypto.randomUUID(),
        source: parsed.data.source,
        startDate: toUtcDate(parsed.data.startDate),
        endDate: toUtcDate(parsed.data.endDate),
        provider: MANUAL_PROVIDER,
        externalReference: parsed.data.externalReference ?? null,
      },
    });
    return createSuccessResponse({
      booking: {
        id: booking.id,
        source: booking.source,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        externalReference: booking.externalReference,
        accessStatus: booking.accessStatus,
      },
    }, 201);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      throw new ApiError(ApiErrorCode.CONFLICT, 'A booking with this reference already exists');
    }
    throw error;
  }
});
