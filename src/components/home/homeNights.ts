// The home page's availability views (identity §8 NightsTeaser and BookBar), computed on the server
// from the F09 availability repository only (§1.4): no number is shown that the data does not hold, and no
// price (owner decision of 2026-10-15). The nights the BookBar advertises follow the stay rules of the
// availability page (plannerState, stayQuote), so it never names a night that page would refuse.

import { bookedNights, checkOutWindow } from '@/components/availability/plannerState';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import type { StayContext } from '@/lib/availability/stayQuote';
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

/**
 * What the BookBar note reads: the calendar and, for the minimum stay, the rate periods (never a price). A
 * view without `rates` has no rate periods, so every night has the default minimum stay.
 */
type FreeNightView = NightsView & Partial<Pick<PublicAvailability, 'rates'>>;

/**
 * Tonight or the next free night that can start a stay, from a fresh calendar only. "Can start a stay" is the
 * planner's own rule (checkOutWindow): the night is free, a check-out day exists from the minimum stay of that
 * night's rate period up to the next booked night, and the maximum stay and the horizon allow it. A free night
 * that the availability page would refuse as a check-in is never advertised; null (no bar) when there is none.
 */
export function nextFreeNight(availability: FreeNightView): NextFreeNight | null {
  if (availability.status !== 'fresh') return null;
  const { today, nights } = availability;
  const context: StayContext = {
    today,
    // One character per night up to the horizon end.
    horizonEnd: addDays(today, nights.length),
    blockedNights: bookedNights(today, nights),
    ratePeriods: availability.rates ?? [],
  };
  for (let index = 0; index < nights.length; index += 1) {
    if (nights.charAt(index) !== 'o') continue;
    const date = addDays(today, index);
    if (checkOutWindow(date, context) !== null) return { tonight: index === 0, date };
  }
  return null;
}
