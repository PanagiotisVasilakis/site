// Syncs the Airbnb calendar export (AIRBNB_ICAL_URL) into the singleton
// calendar_sync_state row: the blocked nights of the availability horizon, as
// a snapshot that only a successful sync replaces. Runs are serialised by a
// short lease on the row, claimed and released with conditional updateMany
// calls; the download and parsing run outside any transaction. A failed run
// keeps the last good snapshot, records a code (never the URL or upstream
// text) and backs off. Only database errors propagate.

import { randomUUID } from 'node:crypto';

import { AVAILABILITY_HORIZON_DAYS, PROPERTY_TIME_ZONE } from '@/data/stayPolicy';
import { addDays, eachNight, propertyToday, toDbDate, type IsoDate } from '@/lib/availability/calendarDate';
import { CalendarFetchError, fetchAirbnbCalendarText } from '@/lib/availability/icalFetch';
import { IcalParseError, parseBlockedRanges } from '@/lib/availability/icalParser';
import { logger } from '@/lib/logger-enterprise';
import { prisma } from '@/lib/prisma';

/** The only calendar_sync_state row (seeded by the migration, enforced by a CHECK). */
export const CALENDAR_SYNC_STATE_ID = 'airbnb';

const LEASE_MS = 60_000;
/** A manual run starts at most this long after the last attempt (the admin route's Retry-After). */
export const MANUAL_MIN_INTERVAL_MS = 60_000;
const SYNC_INTERVAL_MINUTES = 30;
const MAX_BACKOFF_MINUTES = 240;
const MAX_STORED_NIGHTS = 400; // calendar_sync_state_blocked_nights_check

type CalendarSyncResult =
  /** AIRBNB_ICAL_URL is unset; nothing was read or written. */
  | { status: 'not_configured' }
  /** A scheduled run before nextAttemptAt. */
  | { status: 'skipped' }
  /** Another run holds the lease. */
  | { status: 'busy' }
  /** A manual run within a minute of the last attempt. */
  | { status: 'too_soon' }
  | { status: 'synced'; blockedNights: number }
  | { status: 'failed'; code: string; httpStatus?: number }
  /** The lease expired and was taken over before this run could write; it wrote nothing. */
  | { status: 'lease_lost' };

type Failure = { code: string; httpStatus?: number };

const minutesAfter = (instant: Date, minutes: number) => new Date(instant.getTime() + minutes * 60_000);

/** The sorted, distinct nights of the ranges (end exclusive) within [from, to). */
function blockedNightsWithin(ranges: ReturnType<typeof parseBlockedRanges>, from: IsoDate, to: IsoDate): IsoDate[] {
  const nights = new Set<IsoDate>();
  for (const range of ranges) {
    const start = range.start > from ? range.start : from;
    const end = range.end < to ? range.end : to;
    for (const night of eachNight(start, end)) nights.add(night);
  }
  return [...nights].sort();
}

// fetch passes non-standard statuses such as 999 through, but last_http_status
// is CHECKed to 100-599; any other status is recorded by its code alone.
const isRecordableHttpStatus = (status: number | undefined): status is number =>
  status !== undefined && status >= 100 && status <= 599;

function failureOf(error: unknown): Failure {
  if (error instanceof CalendarFetchError) {
    return isRecordableHttpStatus(error.httpStatus) ? { code: error.code, httpStatus: error.httpStatus } : { code: error.code };
  }
  if (error instanceof IcalParseError) return { code: error.code };
  return { code: 'unexpected' };
}

async function recordFailure(leaseOwner: string, now: Date, failure: Failure): Promise<CalendarSyncResult> {
  const state = await prisma.calendarSyncState.findUnique({
    where: { id: CALENDAR_SYNC_STATE_ID },
    select: { consecutiveFailures: true },
  });
  if (!state) throw new Error('The calendar_sync_state row is missing');
  // The first failure keeps the normal interval; each further one doubles it, up to four hours.
  const backoffMinutes = Math.min(SYNC_INTERVAL_MINUTES * 2 ** state.consecutiveFailures, MAX_BACKOFF_MINUTES);
  const written = await prisma.calendarSyncState.updateMany({
    where: { id: CALENDAR_SYNC_STATE_ID, leaseOwner },
    data: {
      lastFailureAt: now,
      lastErrorCode: failure.code,
      lastHttpStatus: failure.httpStatus ?? null,
      consecutiveFailures: { increment: 1 },
      nextAttemptAt: minutesAfter(now, backoffMinutes),
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  if (written.count === 0) return leaseLost();
  logger.warn('Airbnb calendar sync failed', {
    status: 'failed',
    code: failure.code,
    httpStatus: failure.httpStatus ?? null,
    consecutiveFailures: state.consecutiveFailures + 1,
  });
  return { status: 'failed', ...failure };
}

function leaseLost(): CalendarSyncResult {
  logger.warn('Airbnb calendar sync lost its lease', { status: 'lease_lost' });
  return { status: 'lease_lost' };
}

/**
 * One sync run. A scheduled run (the operations worker) runs only when
 * nextAttemptAt is due; a manual run (the admin) at most once a minute.
 * Neither runs while another run holds the lease. On success the snapshot
 * replaces the stored nights; lastFailureAt is kept as history, while
 * consecutiveFailures, lastErrorCode and lastHttpStatus are cleared.
 */
export async function syncAirbnbCalendar({ trigger }: { trigger: 'scheduled' | 'manual' }): Promise<CalendarSyncResult> {
  const url = process.env.AIRBNB_ICAL_URL;
  if (!url) return { status: 'not_configured' };

  const now = new Date();
  const today = propertyToday(PROPERTY_TIME_ZONE, now);
  const horizonEnd = addDays(today, AVAILABILITY_HORIZON_DAYS);
  const leaseOwner = randomUUID();

  const claimed = await prisma.calendarSyncState.updateMany({
    where: {
      id: CALENDAR_SYNC_STATE_ID,
      AND: [
        { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
        trigger === 'scheduled'
          ? { nextAttemptAt: { lte: now } }
          : { OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(now.getTime() - MANUAL_MIN_INTERVAL_MS) } }] },
      ],
    },
    data: { leaseOwner, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), lastAttemptAt: now },
  });
  if (claimed.count !== 1) {
    // Only explains the outcome; the claim above is what serialises the runs.
    const state = await prisma.calendarSyncState.findUnique({
      where: { id: CALENDAR_SYNC_STATE_ID },
      select: { leaseExpiresAt: true },
    });
    if (!state) throw new Error('The calendar_sync_state row is missing');
    if (state.leaseExpiresAt && state.leaseExpiresAt.getTime() >= now.getTime()) return { status: 'busy' };
    return { status: trigger === 'scheduled' ? 'skipped' : 'too_soon' };
  }

  let outcome: { nights: Date[] } | Failure;
  try {
    const nights = blockedNightsWithin(parseBlockedRanges(await fetchAirbnbCalendarText(url)), today, horizonEnd);
    outcome = nights.length > MAX_STORED_NIGHTS ? { code: 'too_many_nights' } : { nights: nights.map(toDbDate) };
  } catch (error) {
    outcome = failureOf(error);
  }
  if (!('nights' in outcome)) return recordFailure(leaseOwner, now, outcome);

  const written = await prisma.calendarSyncState.updateMany({
    where: { id: CALENDAR_SYNC_STATE_ID, leaseOwner },
    data: {
      blockedNights: outcome.nights,
      horizonStart: toDbDate(today),
      horizonEnd: toDbDate(horizonEnd),
      lastSuccessAt: now,
      nextAttemptAt: minutesAfter(now, SYNC_INTERVAL_MINUTES),
      consecutiveFailures: 0,
      lastErrorCode: null,
      lastHttpStatus: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
  if (written.count === 0) return leaseLost();
  logger.info('Airbnb calendar sync finished', { status: 'synced', blockedNights: outcome.nights.length });
  return { status: 'synced', blockedNights: outcome.nights.length };
}
