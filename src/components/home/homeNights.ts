// The home page's availability views (identity §8 NightsTeaser and BookBar), computed on the server
// from the F09 availability repository only (§1.4): no number is shown that the data does not hold, and no
// price (owner decision of 2026-10-15).

import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

const TEASER_NIGHTS = 14;

/** What these views read of the availability data: the calendar, never the rates. */
type NightsView = Pick<PublicAvailability, 'today' | 'status' | 'nights'>;

export type NightCell = Readonly<{ date: IsoDate; booked: boolean }>;

/**
 * The next 14 nights, free or booked, or null when the teaser is not rendered: only a fresh calendar that
 * knows every one of them ('o' or 'b') is shown. A stale or unconfigured calendar marks every night unknown.
 */
export function nightsTeaserFrom(availability: NightsView): readonly NightCell[] | null {
  if (availability.status !== 'fresh') return null;
  const states = availability.nights.slice(0, TEASER_NIGHTS);
  if (!/^[ob]+$/.test(states)) return null;
  return Array.from(states, (state, index) => ({ date: addDays(availability.today, index), booked: state === 'b' }));
}

/** BookBar's note: tonight or the next free night, only from a fresh calendar. */
export type NextFreeNight = Readonly<{ tonight: boolean; date: IsoDate }>;

export function nextFreeNight(availability: NightsView): NextFreeNight | null {
  if (availability.status !== 'fresh') return null;
  const index = availability.nights.indexOf('o');
  if (index < 0) return null;
  return { tonight: index === 0, date: addDays(availability.today, index) };
}
