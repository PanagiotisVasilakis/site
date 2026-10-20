import { describe, expect, it } from 'vitest';

import { addDays, parseIsoDate, type IsoDate } from '@/lib/availability/calendarDate';
import {
  isCheckInAllowed,
  maxCheckOut,
  minimumNightsFor,
  rateForNight,
  validateStay,
  type RatePeriod,
  type StayContext,
} from '@/lib/availability/stayQuote';
import { AVAILABILITY_HORIZON_DAYS, DEFAULT_MINIMUM_NIGHTS, MAX_STAY_NIGHTS } from '@/data/stayPolicy';

function iso(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (parsed === null) throw new Error(`test fixture is not an ISO date: ${value}`);
  return parsed;
}

function period(start: string, end: string, minimumNights: number): RatePeriod {
  return { start: iso(start), end: iso(end), minimumNights };
}

const TODAY = iso('2026-09-28');
const HORIZON_END = addDays(TODAY, AVAILABILITY_HORIZON_DAYS);

// End dates are exclusive: a period [start, end) covers the nights start..end-1.
const OCTOBER_EARLY = period('2026-10-01', '2026-10-15', 2);
const OCTOBER_LATE = period('2026-10-15', '2026-11-01', 3);
const WINTER = period('2026-11-01', '2027-04-01', 1);
const APRIL = period('2027-04-01', '2027-05-01', 2);
const PERIODS = [OCTOBER_EARLY, OCTOBER_LATE, WINTER, APRIL];

const BLOCKED = new Set([iso('2026-10-20')]);

function context(overrides: Partial<StayContext> = {}): StayContext {
  return {
    today: TODAY,
    horizonEnd: HORIZON_END,
    blockedNights: BLOCKED,
    ratePeriods: PERIODS,
    ...overrides,
  };
}

describe('stay policy data', () => {
  it('shows the calendar 365 nights ahead of today', () => {
    expect(HORIZON_END).toBe('2027-09-28');
  });
});

describe('rate periods', () => {
  it('finds the period whose [start, end) range contains the night', () => {
    expect(rateForNight(iso('2026-10-01'), PERIODS)).toBe(OCTOBER_EARLY);
    expect(rateForNight(iso('2026-10-14'), PERIODS)).toBe(OCTOBER_EARLY);
    expect(rateForNight(iso('2026-10-15'), PERIODS)).toBe(OCTOBER_LATE);
    expect(rateForNight(iso('2026-11-01'), PERIODS)).toBe(WINTER);
    expect(rateForNight(iso('2026-09-30'), PERIODS)).toBeNull();
    expect(rateForNight(iso('2027-05-01'), PERIODS)).toBeNull();
    expect(rateForNight(iso('2026-10-01'), [])).toBeNull();
  });

  it('takes the minimum stay from the check-in period, else the default', () => {
    expect(minimumNightsFor(iso('2026-10-14'), PERIODS)).toBe(2);
    expect(minimumNightsFor(iso('2026-10-15'), PERIODS)).toBe(3);
    expect(minimumNightsFor(iso('2026-09-29'), PERIODS)).toBe(DEFAULT_MINIMUM_NIGHTS);
    expect(DEFAULT_MINIMUM_NIGHTS).toBe(1);
  });
});

describe('check-in and check-out bounds', () => {
  it('allows check-in on a free night from today until the horizon', () => {
    expect(isCheckInAllowed(TODAY, BLOCKED, TODAY, HORIZON_END)).toBe(true);
    expect(isCheckInAllowed(iso('2026-10-19'), BLOCKED, TODAY, HORIZON_END)).toBe(true);
    expect(isCheckInAllowed(addDays(HORIZON_END, -1), BLOCKED, TODAY, HORIZON_END)).toBe(true);
    expect(isCheckInAllowed(iso('2026-10-20'), BLOCKED, TODAY, HORIZON_END)).toBe(false);
    expect(isCheckInAllowed(addDays(TODAY, -1), BLOCKED, TODAY, HORIZON_END)).toBe(false);
    expect(isCheckInAllowed(HORIZON_END, BLOCKED, TODAY, HORIZON_END)).toBe(false);
  });

  it('lets a stay end on a blocked night but not run through it', () => {
    expect(maxCheckOut(iso('2026-10-17'), BLOCKED, HORIZON_END)).toBe('2026-10-20');
    expect(maxCheckOut(iso('2026-10-19'), BLOCKED, HORIZON_END)).toBe('2026-10-20');
    expect(maxCheckOut(iso('2026-10-20'), BLOCKED, HORIZON_END)).toBeNull();
  });

  it('caps the check-out at the maximum stay and at the horizon', () => {
    expect(MAX_STAY_NIGHTS).toBe(30);
    expect(maxCheckOut(iso('2026-11-01'), BLOCKED, HORIZON_END)).toBe('2026-12-01');
    expect(maxCheckOut(addDays(HORIZON_END, -3), BLOCKED, HORIZON_END)).toBe(HORIZON_END);
    expect(maxCheckOut(HORIZON_END, BLOCKED, HORIZON_END)).toBeNull();
  });
});

describe('validateStay', () => {
  it('accepts a stay whose check-out day is blocked', () => {
    expect(validateStay('2026-10-17', '2026-10-20', context())).toEqual({
      ok: true,
      checkIn: '2026-10-17',
      checkOut: '2026-10-20',
      nights: 3,
    });
  });

  it('rejects a range that contains a blocked night', () => {
    expect(validateStay('2026-10-18', '2026-10-21', context())).toEqual({ ok: false, reason: 'blocked' });
    expect(validateStay('2026-10-20', '2026-10-23', context())).toEqual({ ok: false, reason: 'blocked' });
  });

  it('applies the minimum stay of the check-in period, even when the stay crosses into another period', () => {
    // Check-in in the 2-night period, second night in the 3-night period.
    expect(validateStay('2026-10-14', '2026-10-16', context())).toMatchObject({ ok: true, nights: 2 });
    expect(validateStay('2026-10-14', '2026-10-15', context())).toEqual({ ok: false, reason: 'min_nights' });
    // Check-in in the 3-night period, second night in the 1-night period.
    expect(validateStay('2026-10-31', '2026-11-02', context())).toEqual({ ok: false, reason: 'min_nights' });
    expect(validateStay('2026-10-30', '2026-11-02', context())).toMatchObject({ ok: true, nights: 3 });
  });

  it('accepts a one-night stay and rejects 31 nights', () => {
    expect(validateStay('2026-09-29', '2026-09-30', context())).toMatchObject({ ok: true, nights: 1 });
    expect(validateStay('2026-11-01', '2026-12-01', context())).toMatchObject({ ok: true, nights: 30 });
    expect(validateStay('2026-11-01', '2026-12-02', context())).toEqual({ ok: false, reason: 'max_nights' });
  });

  it('rejects past check-ins and stays past the horizon', () => {
    expect(validateStay('2026-09-28', '2026-09-29', context())).toMatchObject({ ok: true });
    expect(validateStay('2026-09-27', '2026-09-29', context())).toEqual({ ok: false, reason: 'past' });
    expect(validateStay(addDays(HORIZON_END, -2), HORIZON_END, context())).toMatchObject({ ok: true, nights: 2 });
    expect(validateStay(addDays(HORIZON_END, -2), addDays(HORIZON_END, 1), context())).toEqual({
      ok: false,
      reason: 'beyond_horizon',
    });
    expect(validateStay(HORIZON_END, addDays(HORIZON_END, 1), context())).toEqual({
      ok: false,
      reason: 'beyond_horizon',
    });
  });

  it.each([
    ['2026-02-30', '2026-03-02'],
    ['2026-10-10', '2026-10-10'],
    ['2026-10-12', '2026-10-10'],
    ['2026-10-10', ''],
  ])('rejects %j to %j as invalid', (checkIn, checkOut) => {
    expect(validateStay(checkIn, checkOut, context())).toEqual({ ok: false, reason: 'invalid' });
  });
});
