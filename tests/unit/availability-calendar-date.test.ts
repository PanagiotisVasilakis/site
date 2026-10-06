import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addDays,
  eachNight,
  fromDbDate,
  fromLocalDate,
  nightsBetween,
  parseIsoDate,
  propertyToday,
  toDbDate,
  toLocalDate,
  type IsoDate,
} from '@/lib/availability/calendarDate';
import { PROPERTY_TIME_ZONE } from '@/data/stayPolicy';

function iso(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (parsed === null) throw new Error(`test fixture is not an ISO date: ${value}`);
  return parsed;
}

describe('parseIsoDate', () => {
  it('accepts real calendar dates, including a leap day', () => {
    expect(parseIsoDate('2026-09-28')).toBe('2026-09-28');
    expect(parseIsoDate('2028-02-29')).toBe('2028-02-29');
    expect(parseIsoDate('2000-02-29')).toBe('2000-02-29');
    expect(parseIsoDate('2026-12-31')).toBe('2026-12-31');
  });

  it.each([
    '2026-02-30',
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '2026-9-28',
    '2026-09-28T00:00:00Z',
    ' 2026-09-28',
    '2026-09-28 ',
    '20260928',
    '2026/09/28',
    '+02026-09-28',
    '0050-01-01',
    '２０２６-09-28',
    '',
  ])('rejects %j', (value) => {
    expect(parseIsoDate(value)).toBeNull();
  });
});

describe('calendar arithmetic', () => {
  // A zone with DST (2026-03-29 and 2026-10-25 are change days), so local-time
  // arithmetic would fail here even on a UTC host such as the release gate.
  beforeEach(() => {
    vi.stubEnv('TZ', 'Europe/Athens');
  });

  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays(iso('2026-10-31'), 1)).toBe('2026-11-01');
    expect(addDays(iso('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(iso('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addDays(iso('2028-03-01'), -1)).toBe('2028-02-29');
    expect(addDays(iso('2026-03-01'), -1)).toBe('2026-02-28');
    expect(addDays(iso('2026-09-28'), 0)).toBe('2026-09-28');
    expect(addDays(iso('2026-09-28'), 365)).toBe('2027-09-28');
  });

  it('rejects a non-integer day count and results outside four-digit years', () => {
    expect(() => addDays(iso('2026-09-28'), 1.5)).toThrow(RangeError);
    expect(() => addDays(iso('2026-09-28'), Number.NaN)).toThrow(RangeError);
    expect(() => addDays(iso('9999-12-31'), 1)).toThrow(RangeError);
    expect(() => addDays(iso('2026-09-28'), 200_000_000)).toThrow(RangeError);
  });

  it('counts nights as calendar days, independent of DST', () => {
    expect(nightsBetween(iso('2026-10-24'), iso('2026-10-26'))).toBe(2);
    expect(nightsBetween(iso('2026-03-28'), iso('2026-03-30'))).toBe(2);
    expect(nightsBetween(iso('2028-02-28'), iso('2028-03-01'))).toBe(2);
    expect(nightsBetween(iso('2026-09-28'), iso('2026-09-28'))).toBe(0);
    expect(nightsBetween(iso('2026-09-28'), iso('2026-09-27'))).toBe(-1);
  });

  it('lists the nights check-in through the night before check-out', () => {
    expect(eachNight(iso('2028-02-28'), iso('2028-03-02'))).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
    expect(eachNight(iso('2026-09-28'), iso('2026-09-29'))).toEqual(['2026-09-28']);
    expect(eachNight(iso('2026-09-28'), iso('2026-09-28'))).toEqual([]);
    expect(eachNight(iso('2026-09-28'), iso('2026-09-20'))).toEqual([]);
  });
});

describe('propertyToday', () => {
  it('uses the property calendar day, not the UTC day', () => {
    const now = new Date('2026-10-24T22:30:00Z');
    expect(propertyToday(PROPERTY_TIME_ZONE, now)).toBe('2026-10-25');
    expect(propertyToday('UTC', now)).toBe('2026-10-24');
  });

  it('switches at local midnight on both sides of the October DST change', () => {
    // Summer time (UTC+3) ends 2026-10-25 01:00 UTC; winter time is UTC+2.
    expect(propertyToday('Europe/Athens', new Date('2026-10-24T20:59:59.999Z'))).toBe('2026-10-24');
    expect(propertyToday('Europe/Athens', new Date('2026-10-24T21:00:00.000Z'))).toBe('2026-10-25');
    expect(propertyToday('Europe/Athens', new Date('2026-10-25T21:59:59.999Z'))).toBe('2026-10-25');
    expect(propertyToday('Europe/Athens', new Date('2026-10-25T22:00:00.000Z'))).toBe('2026-10-26');
  });

  it('switches at local midnight on both sides of the March DST change', () => {
    // Summer time starts 2026-03-29 01:00 UTC.
    expect(propertyToday('Europe/Athens', new Date('2026-03-28T21:59:59.999Z'))).toBe('2026-03-28');
    expect(propertyToday('Europe/Athens', new Date('2026-03-28T22:00:00.000Z'))).toBe('2026-03-29');
    expect(propertyToday('Europe/Athens', new Date('2026-03-29T20:59:59.999Z'))).toBe('2026-03-29');
    expect(propertyToday('Europe/Athens', new Date('2026-03-29T21:00:00.000Z'))).toBe('2026-03-30');
  });

  it('rejects an invalid instant or time zone', () => {
    expect(() => propertyToday('Europe/Athens', new Date(Number.NaN))).toThrow(TypeError);
    expect(() => propertyToday('Mars/Olympus', new Date('2026-10-24T22:30:00Z'))).toThrow(RangeError);
    expect(() => propertyToday('UTC', new Date('0999-06-01T00:00:00Z'))).toThrow(RangeError);
  });
});

describe('database DATE conversion', () => {
  it('maps a calendar date to UTC midnight and back', () => {
    const value = toDbDate(iso('2028-02-29'));
    expect(value.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(fromDbDate(value)).toBe('2028-02-29');
  });

  it('rejects a value that is not a UTC-midnight DATE', () => {
    expect(() => fromDbDate(new Date('2026-10-24T22:30:00Z'))).toThrow(RangeError);
    expect(() => fromDbDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe('calendar UI conversion', () => {
  it.each(['Europe/Athens', 'UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Santiago'])(
    'keeps the calendar day in the %s time zone',
    (timeZone) => {
      vi.stubEnv('TZ', timeZone);
      for (const value of ['2026-10-25', '2026-03-29', '2026-09-06', '2028-02-29', '2026-12-31']) {
        const local = toLocalDate(iso(value));
        expect([local.getFullYear(), local.getMonth() + 1, local.getDate()]).toEqual(
          value.split('-').map(Number),
        );
        expect(fromLocalDate(local)).toBe(value);
      }
      expect(fromLocalDate(new Date(2026, 9, 25, 23, 59, 59, 999))).toBe('2026-10-25');
    },
  );

  it('rejects an invalid Date or a year outside 0100-9999', () => {
    expect(() => fromLocalDate(new Date(Number.NaN))).toThrow(RangeError);
    expect(() => fromLocalDate(new Date(10_000, 0, 1))).toThrow(RangeError);
  });
});
