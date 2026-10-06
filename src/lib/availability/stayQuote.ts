// Stay rules and price quotes over ISO calendar dates. End dates are
// exclusive: a rate period [start, end) prices the nights start..end-1, and a
// stay check-in..check-out covers the nights check-in..check-out-1. Money is
// integer cents.

import { DEFAULT_MINIMUM_NIGHTS, MAX_STAY_NIGHTS, type ClimateFeeRule } from '@/data/stayPolicy';

import { addDays, eachNight, nightsBetween, parseIsoDate, type IsoDate } from './calendarDate';

export type RatePeriod = Readonly<{
  start: IsoDate;
  /** Exclusive. */
  end: IsoDate;
  nightlyPriceCents: number;
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

export type PriceGroup = Readonly<{ nightlyPriceCents: number; nights: number; amountCents: number }>;

export type StayQuote =
  | Readonly<{
      priceOnRequest: false;
      nights: number;
      /** One group per nightly price, in order of first appearance. */
      groups: readonly PriceGroup[];
      subtotalCents: number;
      climateFeeCents: number;
      totalCents: number;
    }>
  | Readonly<{ priceOnRequest: true; nights: number; climateFeeCents: number }>;

function assertCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole number of cents`);
  }
}

/** Rate periods do not overlap (the database enforces it); the first match wins. */
export function rateForNight(night: IsoDate, periods: readonly RatePeriod[]): RatePeriod | null {
  return periods.find((period) => period.start <= night && night < period.end) ?? null;
}

/**
 * The "from €X / night" price (identity §1.4): the lowest nightly rate over the first `windowNights`
 * nights from `today` that are not booked. `nights` has one character per night from `today`
 * ('o' open, 'b' booked, 'u' unknown; PublicAvailability.nights); unknown nights count, because the
 * rates apply whether or not the calendar is synced. Null when none of those nights has a rate.
 */
export function lowestNightlyPriceCents(
  today: IsoDate,
  nights: string,
  periods: readonly RatePeriod[],
  windowNights = 60,
): number | null {
  let lowest: number | null = null;
  const count = Math.min(windowNights, nights.length);
  for (let index = 0; index < count; index += 1) {
    if (nights[index] === 'b') continue;
    const cents = rateForNight(addDays(today, index), periods)?.nightlyPriceCents;
    if (cents !== undefined && (lowest === null || cents < lowest)) lowest = cents;
  }
  return lowest;
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

/** The climate fee rule in force on the night: the latest effectiveFrom on or before it, or null. */
export function climateFeeRuleOn(night: IsoDate, schedule: readonly ClimateFeeRule[]): ClimateFeeRule | null {
  let rule: ClimateFeeRule | null = null;
  for (const candidate of schedule) {
    if (parseIsoDate(candidate.effectiveFrom) === null) {
      throw new RangeError(`Invalid climate fee effectiveFrom: ${candidate.effectiveFrom}`);
    }
    if (candidate.effectiveFrom <= night && (rule === null || candidate.effectiveFrom > rule.effectiveFrom)) {
      rule = candidate;
    }
  }
  return rule;
}

/** The fee of the rule in force on the night, by the night's month, with that rule and season. */
function climateFeeOnNight(
  night: IsoDate,
  schedule: readonly ClimateFeeRule[],
): { rule: ClimateFeeRule; season: 'high' | 'low'; cents: number } {
  const rule = climateFeeRuleOn(night, schedule);
  if (rule === null) throw new RangeError(`No climate fee rule is in force on ${night}`);

  const month = Number(night.slice(5, 7));
  const season = rule.highSeasonMonths.includes(month) ? 'high' : 'low';
  const cents = season === 'high' ? rule.highCents : rule.lowCents;
  assertCents(cents, 'The climate fee');
  return { rule, season, cents };
}

function climateFeeForNight(night: IsoDate, schedule: readonly ClimateFeeRule[]): number {
  return climateFeeOnNight(night, schedule).cents;
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export type ClimateFeeGroup = Readonly<{
  season: 'high' | 'low';
  /** The months (1-12) of that season under the rule in force. */
  months: readonly number[];
  cents: number;
  nights: number;
  amountCents: number;
}>;

/**
 * The climate fee of a stay grouped by season, in order of first appearance:
 * 29 Oct to 3 Nov is 3 nights at the high-season fee and 2 at the low one.
 * Nights under different fee rules are separate groups. The amounts add up
 * to quoteStay's climateFeeCents.
 */
export function climateFeeGroups(
  checkIn: IsoDate,
  checkOut: IsoDate,
  feeSchedule: readonly ClimateFeeRule[],
): ClimateFeeGroup[] {
  const groups = new Map<string, { season: 'high' | 'low'; months: readonly number[]; cents: number; nights: number }>();
  for (const night of eachNight(checkIn, checkOut)) {
    const { rule, season, cents } = climateFeeOnNight(night, feeSchedule);
    const key = `${rule.effectiveFrom}|${season}`;
    const group = groups.get(key);
    if (group) {
      group.nights += 1;
    } else {
      const months = season === 'high'
        ? rule.highSeasonMonths
        : ALL_MONTHS.filter((month) => !rule.highSeasonMonths.includes(month));
      groups.set(key, { season, months, cents, nights: 1 });
    }
  }
  return Array.from(groups.values(), (group) => ({ ...group, amountCents: group.cents * group.nights }));
}

/**
 * Prices each night by its rate period and adds the climate fee per night.
 * If any night has no rate the price is on request: no groups, subtotal or
 * total. Call it for a stay that validateStay accepted (1..MAX_STAY_NIGHTS nights).
 */
export function quoteStay(
  checkIn: IsoDate,
  checkOut: IsoDate,
  periods: readonly RatePeriod[],
  feeSchedule: readonly ClimateFeeRule[],
): StayQuote {
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1 || nights > MAX_STAY_NIGHTS) {
    throw new RangeError(`A quote needs 1 to ${MAX_STAY_NIGHTS} nights`);
  }

  let climateFeeCents = 0;
  let priceOnRequest = false;
  const nightsByPrice = new Map<number, number>();
  for (const night of eachNight(checkIn, checkOut)) {
    climateFeeCents += climateFeeForNight(night, feeSchedule);
    const period = rateForNight(night, periods);
    if (period === null) {
      priceOnRequest = true;
      continue;
    }
    assertCents(period.nightlyPriceCents, 'nightlyPriceCents');
    nightsByPrice.set(period.nightlyPriceCents, (nightsByPrice.get(period.nightlyPriceCents) ?? 0) + 1);
  }
  if (priceOnRequest) return { priceOnRequest: true, nights, climateFeeCents };

  const groups = Array.from(nightsByPrice, ([nightlyPriceCents, groupNights]) => ({
    nightlyPriceCents,
    nights: groupNights,
    amountCents: nightlyPriceCents * groupNights,
  }));
  const subtotalCents = groups.reduce((sum, group) => sum + group.amountCents, 0);
  const totalCents = subtotalCents + climateFeeCents;
  // Every term is non-negative, so an unsafe group amount or subtotal makes the total unsafe too.
  assertCents(totalCents, 'totalCents');
  return { priceOnRequest: false, nights, groups, subtotalCents, climateFeeCents, totalCents };
}
