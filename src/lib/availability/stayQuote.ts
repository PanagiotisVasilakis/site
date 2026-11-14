// Stay rules over ISO calendar dates. End dates are exclusive: a rate period
// [start, end) covers the nights start..end-1, and a stay check-in..check-out
// covers the nights check-in..check-out-1. The public site shows no price, so a
// period carries only its minimum stay.

import { DEFAULT_MINIMUM_NIGHTS, MAX_STAY_NIGHTS } from '@/data/stayPolicy';

import { addDays, eachNight, nightsBetween, parseIsoDate, type IsoDate } from './calendarDate';

export type RatePeriod = Readonly<{
  start: IsoDate;
  /** Exclusive. */
  end: IsoDate;
  minimumNights: number;
}>;

export type StayContext = Readonly<{
  /** The property's calendar date today (propertyToday). */
  today: IsoDate;
  /** Exclusive end of the known calendar: a stay may check out on it, not stay that night. */
  horizonEnd: IsoDate;
  blockedNights: ReadonlySet<IsoDate>;
  ratePeriods: readonly RatePeriod[];
}>;

export type StayRejection = 'blocked' | 'min_nights' | 'max_nights' | 'past' | 'beyond_horizon' | 'invalid';

export type StayValidation =
  | Readonly<{ ok: true; checkIn: IsoDate; checkOut: IsoDate; nights: number }>
  | Readonly<{ ok: false; reason: StayRejection }>;

/** Rate periods do not overlap (the database enforces it); the first match wins. */
export function rateForNight(night: IsoDate, periods: readonly RatePeriod[]): RatePeriod | null {
  return periods.find((period) => period.start <= night && night < period.end) ?? null;
}

/** The check-in night's period decides the minimum stay for the whole stay. */
export function minimumNightsFor(checkIn: IsoDate, periods: readonly RatePeriod[]): number {
  return rateForNight(checkIn, periods)?.minimumNights ?? DEFAULT_MINIMUM_NIGHTS;
}

export function isCheckInAllowed(
  night: IsoDate,
  blockedNights: ReadonlySet<IsoDate>,
  today: IsoDate,
  horizonEnd: IsoDate,
): boolean {
  return night >= today && night < horizonEnd && !blockedNights.has(night);
}

/**
 * The latest check-out for a check-in: the first blocked night (a stay may end
 * on it), the horizon end or MAX_STAY_NIGHTS later, whichever comes first.
 * Null when the check-in night itself cannot be booked. Past dates and the
 * minimum stay are checked by isCheckInAllowed and validateStay.
 */
export function maxCheckOut(
  checkIn: IsoDate,
  blockedNights: ReadonlySet<IsoDate>,
  horizonEnd: IsoDate,
): IsoDate | null {
  let checkOut = checkIn;
  for (
    let nights = 0;
    nights < MAX_STAY_NIGHTS && checkOut < horizonEnd && !blockedNights.has(checkOut);
    nights += 1
  ) {
    checkOut = addDays(checkOut, 1);
  }
  return checkOut === checkIn ? null : checkOut;
}

/**
 * Checks, in order: invalid dates or order, past check-in, check-out beyond
 * the horizon, more than MAX_STAY_NIGHTS, a blocked night inside the stay,
 * fewer nights than the check-in period's minimum.
 */
export function validateStay(checkInInput: string, checkOutInput: string, context: StayContext): StayValidation {
  const checkIn = parseIsoDate(checkInInput);
  const checkOut = parseIsoDate(checkOutInput);
  if (checkIn === null || checkOut === null || checkOut <= checkIn) return { ok: false, reason: 'invalid' };
  if (checkIn < context.today) return { ok: false, reason: 'past' };
  if (checkOut > context.horizonEnd) return { ok: false, reason: 'beyond_horizon' };

  const nights = nightsBetween(checkIn, checkOut);
  if (nights > MAX_STAY_NIGHTS) return { ok: false, reason: 'max_nights' };
  if (eachNight(checkIn, checkOut).some((night) => context.blockedNights.has(night))) {
    return { ok: false, reason: 'blocked' };
  }
  if (nights < minimumNightsFor(checkIn, context.ratePeriods)) return { ok: false, reason: 'min_nights' };
  return { ok: true, checkIn, checkOut, nights };
}
