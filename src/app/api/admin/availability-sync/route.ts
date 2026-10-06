import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  ApiError,
  ApiErrorCode,
  createSuccessResponse,
  readJsonBody,
  ValidationError,
  withErrorHandler,
} from '@/lib/apiErrorHandler';
import { CALENDAR_STALE_ALERT_MINUTES } from '@/data/stayPolicy';
import { fromDbDate } from '@/lib/availability/calendarDate';
import {
  CALENDAR_SYNC_STATE_ID,
  MANUAL_MIN_INTERVAL_MS,
  syncAirbnbCalendar,
} from '@/lib/availability/calendarSync';
import { isSameOriginRequest } from '@/lib/net/sameOrigin';
import { prisma } from '@/lib/prisma';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// The Airbnb calendar sync as the admin sees it. GET reports the sync state
// (instants as ISO strings, horizon dates as ISO calendar dates, the number of
// blocked nights); POST runs a manual sync. Neither ever returns or logs
// AIRBNB_ICAL_URL: `configured` only says whether it is set.

/** Same threshold as the "Stale availability calendar" alert, so the page and the alert agree. */
const STALE_AFTER_MS = CALENDAR_STALE_ALERT_MINUTES * 60 * 1_000;

const syncRequestSchema = z.object({}).strict();

async function requireAdmin(request: NextRequest): Promise<void> {
  if (!(await isAdminRequest(request))) {
    throw new ApiError(ApiErrorCode.UNAUTHORIZED, 'Admin credentials required');
  }
}

const isConfigured = () => Boolean(process.env.AIRBNB_ICAL_URL);

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);

  const state = await prisma.calendarSyncState.findUnique({
    where: { id: CALENDAR_SYNC_STATE_ID },
    select: {
      blockedNights: true,
      horizonStart: true,
      horizonEnd: true,
      lastSuccessAt: true,
      lastAttemptAt: true,
      lastFailureAt: true,
      lastErrorCode: true,
      lastHttpStatus: true,
      consecutiveFailures: true,
      nextAttemptAt: true,
    },
  });
  if (!state) throw new Error('The calendar_sync_state row is missing');

  const configured = isConfigured();
  return createSuccessResponse({
    configured,
    lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
    lastAttemptAt: state.lastAttemptAt?.toISOString() ?? null,
    lastFailureAt: state.lastFailureAt?.toISOString() ?? null,
    lastErrorCode: state.lastErrorCode,
    lastHttpStatus: state.lastHttpStatus,
    consecutiveFailures: state.consecutiveFailures,
    nights: state.blockedNights.length,
    horizonStart: state.horizonStart ? fromDbDate(state.horizonStart) : null,
    horizonEnd: state.horizonEnd ? fromDbDate(state.horizonEnd) : null,
    nextAttemptAt: state.nextAttemptAt.toISOString(),
    stale: configured
      && (state.lastSuccessAt === null || Date.now() - state.lastSuccessAt.getTime() > STALE_AFTER_MS),
  });
});

/** Seconds until a manual sync may start again, at least 1. */
async function retryAfterSeconds(): Promise<number> {
  const state = await prisma.calendarSyncState.findUnique({
    where: { id: CALENDAR_SYNC_STATE_ID },
    select: { lastAttemptAt: true },
  });
  if (!state?.lastAttemptAt) return 1;
  const remainingMs = state.lastAttemptAt.getTime() + MANUAL_MIN_INTERVAL_MS - Date.now();
  return Math.max(1, Math.ceil(remainingMs / 1_000));
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  const origin = request.headers.get('origin');
  if (origin && !isSameOriginRequest(origin, request)) {
    throw new ApiError(ApiErrorCode.FORBIDDEN, 'Cross-origin admin mutation rejected');
  }

  const parsed = syncRequestSchema.safeParse(await readJsonBody(request, 256));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  const result = await syncAirbnbCalendar({ trigger: 'manual' });
  switch (result.status) {
    case 'synced':
      return createSuccessResponse({ status: result.status, nights: result.blockedNights });
    case 'not_configured':
      throw new ApiError(ApiErrorCode.CONFLICT, 'The availability calendar is not configured');
    case 'busy':
    case 'lease_lost':
      throw new ApiError(ApiErrorCode.CONFLICT, 'Another calendar sync is in progress');
    case 'too_soon': {
      const retryAfter = await retryAfterSeconds();
      const error = new ApiError(ApiErrorCode.RATE_LIMITED, 'A manual sync ran less than a minute ago', { retryAfter });
      // withErrorHandler does not set Retry-After, so this response is built here.
      return NextResponse.json(error.toJSON(), {
        status: error.statusCode,
        headers: { 'Retry-After': String(retryAfter), 'X-Error-Code': error.code },
      });
    }
    case 'failed':
      throw new ApiError(ApiErrorCode.EXTERNAL_SERVICE_ERROR, 'The calendar sync failed', {
        code: result.code,
        httpStatus: result.httpStatus ?? null,
      });
    case 'skipped':
      // Only scheduled runs are skipped; answered like any other run that did not start.
      throw new ApiError(ApiErrorCode.CONFLICT, 'The calendar sync did not run');
  }
});
