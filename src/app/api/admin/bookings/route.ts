import crypto from 'node:crypto';
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
import { nightsBetween, parseIsoDate, toDbDate } from '@/lib/availability/calendarDate';
import { isSameOriginRequest } from '@/lib/net/sameOrigin';
import { prisma } from '@/lib/prisma';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Bookings created by the host in the admin UI. Calendar dates travel as
// `yyyy-MM-dd` and are stored as UTC midnight in the DATE columns, matching the
// UTC calendar-date convention of src/lib/portalBookingEligibility.ts.
const MANUAL_PROVIDER = 'manual';

// A booking cannot be edited or deleted, so a typo in the year or the length has
// to be caught at entry: 180 nights rejects a one-year typo and still fits a
// long winter stay.
const MAX_MANUAL_STAY_NIGHTS = 180;

const isoDateSchema = z.iso.date().transform((value, context) => {
  // z.iso.date() accepts years 0000-0099, which the UTC-midnight conversion
  // would map to 1900-1999.
  const date = parseIsoDate(value);
  if (date === null) {
    context.addIssue({ code: 'custom', message: 'Date must be between the years 0100 and 9999' });
    return z.NEVER;
  }
  return date;
});

const schema = z.object({
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  source: z.enum(['ONSITE', 'EXTERNAL']).default('ONSITE'),
  externalReference: z.string().trim().min(1).max(128).optional(),
}).strict().refine((value) => value.endDate > value.startDate, {
  path: ['endDate'],
  message: 'Check-out must be after check-in',
}).refine((value) => nightsBetween(value.startDate, value.endDate) <= MAX_MANUAL_STAY_NIGHTS, {
  path: ['endDate'],
  message: `A stay can be at most ${MAX_MANUAL_STAY_NIGHTS} nights`,
});

export const POST = withErrorHandler(async (request: NextRequest) => {
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
        startDate: toDbDate(parsed.data.startDate),
        endDate: toDbDate(parsed.data.endDate),
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
