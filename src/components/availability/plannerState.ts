// Selection rules of the availability planner, on top of the stay rules in
// src/lib/availability/stayQuote.ts. The selection lives in the URL fragment
// ('#checkin=YYYY-MM-DD&checkout=YYYY-MM-DD'), never in the query, so it is
// never sent to the server.

import { addDays, nightsBetween, parseIsoDate, type IsoDate } from '@/lib/availability/calendarDate';
import {
  isCheckInAllowed,
  maxCheckOut,
  minimumNightsFor,
  type StayContext,
} from '@/lib/availability/stayQuote';

export type Selection = Readonly<{ checkIn: IsoDate | null; checkOut: IsoDate | null }>;

export const EMPTY_SELECTION: Selection = { checkIn: null, checkOut: null };

/** The night's code in PublicAvailability.nights ('o', 'b' or 'u'), or null outside [today, horizon end). */
export function nightCodeOn(night: IsoDate, today: IsoDate, nights: string): string | null {
  const index = nightsBetween(today, night);
  return index >= 0 && index < nights.length ? nights.charAt(index) : null;
}

/** The booked nights of PublicAvailability.nights. */
export function bookedNights(today: IsoDate, nights: string): Set<IsoDate> {
  const booked = new Set<IsoDate>();
  for (let index = nights.indexOf('b'); index !== -1; index = nights.indexOf('b', index + 1)) {
    booked.add(addDays(today, index));
  }
  return booked;
}

/**
 * The check-out days a check-in allows, first and last inclusive: from the
 * check-in period's minimum stay to maxCheckOut. Null when no valid stay can
 * start on the day (past, beyond the horizon, booked, or too short before the
 * next booked night).
 */
export function checkOutWindow(checkIn: IsoDate, context: StayContext): { first: IsoDate; last: IsoDate } | null {
  if (!isCheckInAllowed(checkIn, context.blockedNights, context.today, context.horizonEnd)) return null;
  const last = maxCheckOut(checkIn, context.blockedNights, context.horizonEnd);
  if (last === null) return null;
  const first = addDays(checkIn, minimumNightsFor(checkIn, context.ratePeriods));
  return first <= last ? { first, last } : null;
}

/**
 * A night that is free (not past, not booked, inside the horizon) but cannot start a stay, because the
 * minimum stay of its rate period does not fit before the next booked night, the longest stay or the
 * horizon end. The calendar styles and names such a night apart from a booked or a past one.
 */
export function isTooShortToStart(night: IsoDate, context: StayContext): boolean {
  return isCheckInAllowed(night, context.blockedNights, context.today, context.horizonEnd) && checkOutWindow(night, context) === null;
}

/** Whether any night of the calendar is too short to start a stay (the legend explains that style only then). */
export function hasTooShortNight(context: StayContext): boolean {
  for (let night = context.today; night < context.horizonEnd; night = addDays(night, 1)) {
    if (isTooShortToStart(night, context)) return true;
  }
  return false;
}

/**
 * The selection in a URL fragment: a valid check-in, optionally with a later
 * check-out. Anything else (bad dates, a check-out without check-in or not
 * after it, other fragments such as '#contact') is null and ignored.
 */
export function readSelectionFragment(hash: string): Selection | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const checkIn = parseIsoDate(params.get('checkin') ?? '');
  if (checkIn === null) return null;
  const checkOutText = params.get('checkout');
  if (checkOutText === null) return { checkIn, checkOut: null };
  const checkOut = parseIsoDate(checkOutText);
  return checkOut !== null && checkOut > checkIn ? { checkIn, checkOut } : null;
}

const MONTH_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/**
 * The month to open from a URL fragment '#m=YYYY-MM' (the home season links),
 * as its first day: only a month from today's month on that still has a night
 * before the horizon end. Anything else is null and ignored.
 */
export function readMonthFragment(hash: string, today: IsoDate, horizonEnd: IsoDate): IsoDate | null {
  const month = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('m') ?? '';
  const firstDay = MONTH_PATTERN.test(month) ? parseIsoDate(`${month}-01`) : null;
  if (firstDay === null || month < today.slice(0, 7) || firstDay >= horizonEnd) return null;
  return firstDay;
}

/** '#checkin=…&checkout=…', '#checkin=…' or '' for no selection. */
export function selectionFragment(selection: Selection): string {
  if (selection.checkIn === null) return '';
  return selection.checkOut === null
    ? `#checkin=${selection.checkIn}`
    : `#checkin=${selection.checkIn}&checkout=${selection.checkOut}`;
}
