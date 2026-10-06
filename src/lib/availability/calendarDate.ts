// Calendar dates for availability and prices: ISO 'YYYY-MM-DD' strings with
// no time and no zone. Arithmetic runs on UTC midnights, so DST never moves a
// date. End dates are exclusive: a stay check-in..check-out covers the nights
// check-in..check-out-1.

declare const isoDateBrand: unique symbol;

/** A valid calendar date 'YYYY-MM-DD' (year 0100-9999); create it with parseIsoDate. */
export type IsoDate = string & { readonly [isoDateBrand]: true };

const ISO_DATE_PATTERN = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const MS_PER_DAY = 86_400_000;

function utcMs(date: IsoDate): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function isoFromUtc(instant: Date): IsoDate {
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Invalid date');
  const parsed = parseIsoDate(instant.toISOString().slice(0, 10));
  if (parsed === null) throw new RangeError('Date is outside the years 0100-9999');
  return parsed;
}

function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  // Date.UTC rolls 2026-02-30 over to 2026-03-02 and maps years 0-99 to 1900-1999.
  return date.toISOString().slice(0, 10) === value;
}

/**
 * Strict: exactly 'YYYY-MM-DD' and a real calendar day (2026-02-30 is
 * rejected, 2028-02-29 accepted). Years below 0100 are rejected.
 */
export function parseIsoDate(value: string): IsoDate | null {
  return isIsoDate(value) ? value : null;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isSafeInteger(days)) throw new RangeError('days must be an integer');
  return isoFromUtc(new Date(utcMs(date) + days * MS_PER_DAY));
}

/** Nights from check-in to check-out; zero or negative when check-out is not after check-in. */
export function nightsBetween(checkIn: IsoDate, checkOut: IsoDate): number {
  return (utcMs(checkOut) - utcMs(checkIn)) / MS_PER_DAY;
}

/** The nights check-in..check-out-1; empty when check-out is not after check-in. */
export function eachNight(checkIn: IsoDate, checkOut: IsoDate): IsoDate[] {
  const nights: IsoDate[] = [];
  for (let night = checkIn; night < checkOut; night = addDays(night, 1)) {
    nights.push(night);
  }
  return nights;
}

/** The calendar date at the property at `now` (e.g. 2026-10-24T22:30Z is 2026-10-25 in Europe/Athens). */
export function propertyToday(timeZone: string, now: Date): IsoDate {
  if (!Number.isFinite(now.getTime())) throw new TypeError('A valid current time is required');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  const parsed = parseIsoDate(`${part('year')}-${part('month')}-${part('day')}`);
  if (parsed === null) throw new RangeError(`Unable to resolve the calendar date in ${timeZone}`);
  return parsed;
}

/** The value for a PostgreSQL DATE column: UTC midnight, as Prisma surfaces DATE. */
export function toDbDate(date: IsoDate): Date {
  return new Date(utcMs(date));
}

export function fromDbDate(value: Date): IsoDate {
  if (!Number.isFinite(value.getTime()) || value.getTime() % MS_PER_DAY !== 0) {
    throw new RangeError('A DATE value must be a UTC midnight');
  }
  return isoFromUtc(value);
}

/**
 * A Date with the same local year/month/day, for a calendar widget that reads
 * local components. The day is the same in every time zone, so server render
 * and client hydration agree.
 */
export function toLocalDate(date: IsoDate): Date {
  return new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

/** The local year/month/day of a calendar widget's Date; the time of day is ignored. */
export function fromLocalDate(value: Date): IsoDate {
  if (!Number.isFinite(value.getTime())) throw new RangeError('Invalid date');
  const text = [
    String(value.getFullYear()).padStart(4, '0'),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
  const parsed = parseIsoDate(text);
  if (parsed === null) throw new RangeError('Date is outside the years 0100-9999');
  return parsed;
}
