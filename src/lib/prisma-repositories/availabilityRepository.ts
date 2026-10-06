import {
  AVAILABILITY_HORIZON_DAYS,
  CALENDAR_PUBLIC_STALE_HOURS,
  PROPERTY_TIME_ZONE,
} from '@/data/stayPolicy';
import {
  addDays,
  eachNight,
  fromDbDate,
  propertyToday,
  toDbDate,
  type IsoDate,
} from '@/lib/availability/calendarDate';
import { CALENDAR_SYNC_STATE_ID } from '@/lib/availability/calendarSync';
import type { RatePeriod } from '@/lib/availability/stayQuote';
import { prisma } from '@/lib/prisma';

// What the public availability page may show: the free and booked nights of
// the horizon (from the Airbnb calendar sync) and the rate periods. Nothing
// here identifies a guest or a booking: the sync stores dates only.

/**
 * fresh: the booked nights come from a sync at most CALENDAR_PUBLIC_STALE_HOURS old.
 * stale: the calendar is configured but that sync is older (or never happened).
 * not_configured: AIRBNB_ICAL_URL is unset.
 * unavailable: the page could not read this data at all (never returned here).
 * Only fresh data marks nights as open or booked; otherwise every night is unknown
 * and only the prices are quoted.
 */
export type AvailabilityStatus = 'fresh' | 'stale' | 'unavailable' | 'not_configured';

export type PublicAvailability = Readonly<{
  /** The property's calendar date (PROPERTY_TIME_ZONE) at the time of the read. */
  today: IsoDate;
  /** Exclusive: today + AVAILABILITY_HORIZON_DAYS. */
  horizonEnd: IsoDate;
  status: AvailabilityStatus;
  /** The last successful sync (ISO instant), when the calendar is configured. */
  lastSyncedAt: string | null;
  /**
   * One character per night from today to horizonEnd (exclusive):
   * 'o' open, 'b' booked (blocked on Airbnb), 'u' unknown.
   */
  nights: string;
  /** The rate periods that share a night with [today, horizonEnd), by start date. */
  rates: readonly RatePeriod[];
}>;

const STALE_AFTER_MS = CALENDAR_PUBLIC_STALE_HOURS * 3_600_000;

type SyncSnapshot = Readonly<{
  blockedNights: Date[];
  horizonStart: Date | null;
  horizonEnd: Date | null;
}>;

function encodeNights(today: IsoDate, horizonEnd: IsoDate, snapshot: SyncSnapshot | null): string {
  const blocked = new Set(snapshot?.blockedNights.map(fromDbDate));
  const syncedFrom = snapshot?.horizonStart ? fromDbDate(snapshot.horizonStart) : null;
  const syncedTo = snapshot?.horizonEnd ? fromDbDate(snapshot.horizonEnd) : null;
  return eachNight(today, horizonEnd).map((night) => {
    // A night the sync did not cover is unknown, not open.
    if (syncedFrom === null || syncedTo === null || night < syncedFrom || night >= syncedTo) return 'u';
    return blocked.has(night) ? 'b' : 'o';
  }).join('');
}

/** The public availability at `now`; throws on database errors (the page shows them as unavailable). */
export async function readPublicAvailability(now: Date): Promise<PublicAvailability> {
  const today = propertyToday(PROPERTY_TIME_ZONE, now);
  const horizonEnd = addDays(today, AVAILABILITY_HORIZON_DAYS);

  const [state, rows] = await prisma.$transaction([
    prisma.calendarSyncState.findUnique({
      where: { id: CALENDAR_SYNC_STATE_ID },
      select: { blockedNights: true, horizonStart: true, horizonEnd: true, lastSuccessAt: true },
    }),
    prisma.ratePeriod.findMany({
      where: { startDate: { lt: toDbDate(horizonEnd) }, endDate: { gt: toDbDate(today) } },
      orderBy: { startDate: 'asc' },
      select: { startDate: true, endDate: true, nightlyPriceCents: true, minimumNights: true },
    }),
  ]);
  if (!state) throw new Error('The calendar_sync_state row is missing');

  const rates = rows.map((row) => ({
    start: fromDbDate(row.startDate),
    end: fromDbDate(row.endDate),
    nightlyPriceCents: row.nightlyPriceCents,
    minimumNights: row.minimumNights,
  }));

  if (!process.env.AIRBNB_ICAL_URL) {
    return { today, horizonEnd, status: 'not_configured', lastSyncedAt: null, nights: encodeNights(today, horizonEnd, null), rates };
  }

  const lastSyncedAt = state.lastSuccessAt?.toISOString() ?? null;
  const fresh = state.lastSuccessAt !== null && now.getTime() - state.lastSuccessAt.getTime() <= STALE_AFTER_MS;
  return {
    today,
    horizonEnd,
    status: fresh ? 'fresh' : 'stale',
    lastSyncedAt,
    nights: encodeNights(today, horizonEnd, fresh ? state : null),
    rates,
  };
}
