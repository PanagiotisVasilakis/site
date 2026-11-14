import { describe, expect, it } from 'vitest';

import { hasTooShortNight, isTooShortToStart } from '@/components/availability/plannerState';
import { MAX_STAY_NIGHTS } from '@/data/stayPolicy';
import { eachNight, parseIsoDate, type IsoDate } from '@/lib/availability/calendarDate';
import type { RatePeriod, StayContext } from '@/lib/availability/stayQuote';

function iso(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (parsed === null) throw new Error(`test fixture is not an ISO date: ${value}`);
  return parsed;
}

const TODAY = iso('2026-10-05');
const HORIZON_END = iso('2026-11-05');

function context(booked: readonly string[], minimumNights: number | null, overrides: Partial<StayContext> = {}): StayContext {
  const ratePeriods: RatePeriod[] = minimumNights === null
    ? []
    : [{ start: iso('2026-10-01'), end: iso('2027-01-01'), minimumNights }];
  return { today: TODAY, horizonEnd: HORIZON_END, blockedNights: new Set(booked.map(iso)), ratePeriods, ...overrides };
}

describe('isTooShortToStart', () => {
  // Free 12 and 13 October between the booked 11th and 14th: a 2-night gap.
  const gap = ['2026-10-11', '2026-10-14'];

  it('is true for a free night whose minimum stay does not fit before the next booked night', () => {
    expect(isTooShortToStart(iso('2026-10-12'), context(gap, 3))).toBe(true);
    expect(isTooShortToStart(iso('2026-10-13'), context(gap, 2))).toBe(true);
  });

  it('is false where the minimum fits, including exactly up to the booked night', () => {
    expect(isTooShortToStart(iso('2026-10-12'), context(gap, 2))).toBe(false);
    expect(isTooShortToStart(iso('2026-10-13'), context(gap, 1))).toBe(false);
    expect(isTooShortToStart(iso('2026-10-12'), context(gap, null))).toBe(false);
  });

  it('is false for a booked night and for a past night', () => {
    expect(isTooShortToStart(iso('2026-10-11'), context(gap, 3))).toBe(false);
    expect(isTooShortToStart(iso('2026-10-04'), context(gap, 3))).toBe(false);
  });

  it('is false for a night from the horizon end on, true for a free night whose minimum runs past it', () => {
    expect(isTooShortToStart(HORIZON_END, context([], 2))).toBe(false);
    expect(isTooShortToStart(iso('2026-11-04'), context([], 2))).toBe(true);
    expect(isTooShortToStart(iso('2026-11-04'), context([], 1))).toBe(false);
  });

  it('is true when the minimum is longer than the longest stay', () => {
    expect(isTooShortToStart(TODAY, context([], MAX_STAY_NIGHTS + 1))).toBe(true);
    expect(isTooShortToStart(TODAY, context([], MAX_STAY_NIGHTS))).toBe(false);
  });
});

describe('hasTooShortNight', () => {
  it('is true when a gap between booked nights is shorter than the minimum stay', () => {
    expect(hasTooShortNight(context(['2026-10-11', '2026-10-14'], 3))).toBe(true);
  });

  it('is true for the free night before any booked night under a minimum of two nights or more', () => {
    expect(hasTooShortNight(context(['2026-10-11', '2026-10-20'], 2))).toBe(true);
  });

  it('is false when every free night can start a stay', () => {
    expect(hasTooShortNight(context(['2026-10-11', '2026-10-14'], 1))).toBe(false);
    expect(hasTooShortNight(context(['2026-10-11', '2026-10-14'], null))).toBe(false);
    expect(hasTooShortNight(context([], 1))).toBe(false);
  });

  it('is false for a calendar with no free night', () => {
    expect(hasTooShortNight(context(eachNight(TODAY, HORIZON_END), 3))).toBe(false);
  });

  it('is true when the minimum stay runs past the end of the calendar', () => {
    expect(hasTooShortNight(context([], 2, { horizonEnd: iso('2026-10-06') }))).toBe(true);
  });
});
