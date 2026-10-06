import { describe, expect, it } from 'vitest';

import { addDays, parseIsoDate, type IsoDate } from '@/lib/availability/calendarDate';
import {
  climateFeeGroups,
  isCheckInAllowed,
  lowestNightlyPriceCents,
  maxCheckOut,
  minimumNightsFor,
  quoteStay,
  rateForNight,
  validateStay,
  type RatePeriod,
  type StayContext,
} from '@/lib/availability/stayQuote';
import {
  AVAILABILITY_HORIZON_DAYS,
  CLIMATE_FEE_SCHEDULE,
  DEFAULT_MINIMUM_NIGHTS,
  MAX_STAY_NIGHTS,
  type ClimateFeeRule,
} from '@/data/stayPolicy';

function iso(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (parsed === null) throw new Error(`test fixture is not an ISO date: ${value}`);
  return parsed;
}

function period(start: string, end: string, nightlyPriceCents: number, minimumNights: number): RatePeriod {
  return { start: iso(start), end: iso(end), nightlyPriceCents, minimumNights };
}

const TODAY = iso('2026-09-28');
const HORIZON_END = addDays(TODAY, AVAILABILITY_HORIZON_DAYS);

// End dates are exclusive: a period [start, end) prices the nights start..end-1.
const OCTOBER_EARLY = period('2026-10-01', '2026-10-15', 8000, 2);
const OCTOBER_LATE = period('2026-10-15', '2026-11-01', 9500, 3);
const WINTER = period('2026-11-01', '2027-04-01', 6000, 1);
const APRIL = period('2027-04-01', '2027-05-01', 7000, 2);
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
  it('keeps the climate resilience fee in one dated, sourced schedule', () => {
    expect(CLIMATE_FEE_SCHEDULE).toEqual([
      {
        effectiveFrom: '2025-01-01',
        highSeasonMonths: [4, 5, 6, 7, 8, 9, 10],
        highCents: 800,
        lowCents: 200,
        source: 'https://www.aade.gr/sites/default/files/2026-02/FAQs_el_telos_anthektikotitas_stin_klimatiki_krisi_02_02_2026.pdf',
      },
    ]);
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
    ['10/10/2026', '2026-10-12'],
  ])('rejects %j to %j as invalid', (checkIn, checkOut) => {
    expect(validateStay(checkIn, checkOut, context())).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('quoteStay', () => {
  it('prices 3 nights at 80 EUR plus the high-season climate fee', () => {
    expect(quoteStay(iso('2026-10-10'), iso('2026-10-13'), PERIODS, CLIMATE_FEE_SCHEDULE)).toEqual({
      priceOnRequest: false,
      nights: 3,
      groups: [{ nightlyPriceCents: 8000, nights: 3, amountCents: 24000 }],
      subtotalCents: 24000,
      climateFeeCents: 2400,
      totalCents: 26400,
    });
  });

  it('prices each night by its own period across adjacent periods', () => {
    expect(quoteStay(iso('2026-10-13'), iso('2026-10-17'), PERIODS, CLIMATE_FEE_SCHEDULE)).toEqual({
      priceOnRequest: false,
      nights: 4,
      groups: [
        { nightlyPriceCents: 8000, nights: 2, amountCents: 16000 },
        { nightlyPriceCents: 9500, nights: 2, amountCents: 19000 },
      ],
      subtotalCents: 35000,
      climateFeeCents: 3200,
      totalCents: 38200,
    });
  });

  it('groups nights by price in order of first appearance', () => {
    const periods = [
      period('2026-10-01', '2026-10-03', 8000, 1),
      period('2026-10-03', '2026-10-04', 9500, 1),
      period('2026-10-04', '2026-10-06', 8000, 1),
    ];
    expect(quoteStay(iso('2026-10-01'), iso('2026-10-06'), periods, CLIMATE_FEE_SCHEDULE)).toMatchObject({
      groups: [
        { nightlyPriceCents: 8000, nights: 4, amountCents: 32000 },
        { nightlyPriceCents: 9500, nights: 1, amountCents: 9500 },
      ],
      subtotalCents: 41500,
    });
  });

  it('charges the October 31 night 8 EUR and the November 1 night 2 EUR', () => {
    expect(quoteStay(iso('2026-10-30'), iso('2026-11-02'), PERIODS, CLIMATE_FEE_SCHEDULE)).toEqual({
      priceOnRequest: false,
      nights: 3,
      groups: [
        { nightlyPriceCents: 9500, nights: 2, amountCents: 19000 },
        { nightlyPriceCents: 6000, nights: 1, amountCents: 6000 },
      ],
      subtotalCents: 25000,
      climateFeeCents: 800 + 800 + 200,
      totalCents: 26800,
    });
    expect(quoteStay(iso('2026-10-31'), iso('2026-11-01'), PERIODS, CLIMATE_FEE_SCHEDULE)).toMatchObject({
      climateFeeCents: 800,
    });
    expect(quoteStay(iso('2026-11-01'), iso('2026-11-02'), PERIODS, CLIMATE_FEE_SCHEDULE)).toMatchObject({
      climateFeeCents: 200,
    });
  });

  it('switches to the high-season fee on the April 1 night', () => {
    expect(quoteStay(iso('2027-03-30'), iso('2027-04-02'), PERIODS, CLIMATE_FEE_SCHEDULE)).toEqual({
      priceOnRequest: false,
      nights: 3,
      groups: [
        { nightlyPriceCents: 6000, nights: 2, amountCents: 12000 },
        { nightlyPriceCents: 7000, nights: 1, amountCents: 7000 },
      ],
      subtotalCents: 19000,
      climateFeeCents: 200 + 200 + 800,
      totalCents: 20200,
    });
  });

  it('asks for the price, with no total, when any night has no rate', () => {
    const quote = quoteStay(iso('2026-09-29'), iso('2026-10-02'), PERIODS, CLIMATE_FEE_SCHEDULE);
    expect(quote).toEqual({ priceOnRequest: true, nights: 3, climateFeeCents: 2400 });
    expect(quote).not.toHaveProperty('totalCents');
    expect(quote).not.toHaveProperty('subtotalCents');
  });

  it('uses the fee rule in force on each night', () => {
    const schedule: readonly ClimateFeeRule[] = [
      ...CLIMATE_FEE_SCHEDULE,
      {
        effectiveFrom: '2027-01-01',
        highSeasonMonths: [4, 5, 6, 7, 8, 9, 10],
        highCents: 1000,
        lowCents: 300,
        source: 'https://example.test/next-rule',
      },
    ];
    expect(quoteStay(iso('2026-12-30'), iso('2027-01-02'), PERIODS, schedule)).toMatchObject({
      climateFeeCents: 200 + 200 + 300,
    });
  });

  it('uses the rule with the latest effectiveFrom, whatever the schedule order', () => {
    const schedule: readonly ClimateFeeRule[] = [
      {
        effectiveFrom: '2027-01-01',
        highSeasonMonths: [4, 5, 6, 7, 8, 9, 10],
        highCents: 1000,
        lowCents: 300,
        source: 'https://example.test/next-rule',
      },
      ...CLIMATE_FEE_SCHEDULE,
    ];
    expect(quoteStay(iso('2026-12-30'), iso('2027-01-02'), PERIODS, schedule)).toMatchObject({
      climateFeeCents: 200 + 200 + 300,
    });
  });

  it('refuses to guess a fee before the first rule or from a malformed rule', () => {
    const late: readonly ClimateFeeRule[] = [{ ...CLIMATE_FEE_SCHEDULE[0], effectiveFrom: '2026-10-11' }];
    expect(() => quoteStay(iso('2026-10-10'), iso('2026-10-12'), PERIODS, late)).toThrow(RangeError);
    const malformed: readonly ClimateFeeRule[] = [{ ...CLIMATE_FEE_SCHEDULE[0], effectiveFrom: '2025-02-30' }];
    expect(() => quoteStay(iso('2026-10-10'), iso('2026-10-12'), PERIODS, malformed)).toThrow(RangeError);
    const fractional: readonly ClimateFeeRule[] = [{ ...CLIMATE_FEE_SCHEDULE[0], highCents: 7.5 }];
    expect(() => quoteStay(iso('2026-10-10'), iso('2026-10-12'), PERIODS, fractional)).toThrow(RangeError);
    const negativeHigh: readonly ClimateFeeRule[] = [{ ...CLIMATE_FEE_SCHEDULE[0], highCents: -800 }];
    expect(() => quoteStay(iso('2026-10-10'), iso('2026-10-12'), PERIODS, negativeHigh)).toThrow(RangeError);
    const negativeLow: readonly ClimateFeeRule[] = [{ ...CLIMATE_FEE_SCHEDULE[0], lowCents: -200 }];
    expect(() => quoteStay(iso('2026-11-10'), iso('2026-11-12'), PERIODS, negativeLow)).toThrow(RangeError);
  });

  it('refuses a stay that validateStay would reject for its length', () => {
    expect(() => quoteStay(iso('2026-10-10'), iso('2026-10-10'), PERIODS, CLIMATE_FEE_SCHEDULE)).toThrow(RangeError);
    expect(() => quoteStay(iso('2026-11-01'), iso('2026-12-02'), PERIODS, CLIMATE_FEE_SCHEDULE)).toThrow(RangeError);
  });

  it('refuses a rate period whose price is not whole cents', () => {
    const periods = [period('2026-10-01', '2026-10-15', 80.5, 1)];
    expect(() => quoteStay(iso('2026-10-10'), iso('2026-10-11'), periods, CLIMATE_FEE_SCHEDULE)).toThrow(RangeError);
  });

  it('refuses a negative nightly price', () => {
    const periods = [period('2026-10-01', '2026-10-15', -100, 1)];
    expect(() => quoteStay(iso('2026-10-10'), iso('2026-10-11'), periods, CLIMATE_FEE_SCHEDULE)).toThrow(RangeError);
  });

  it('refuses a total beyond the safe-integer range', () => {
    // Each nightly price is a safe integer; two nights of it are not.
    const periods = [period('2026-10-01', '2026-10-15', Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1, 1)];
    expect(() => quoteStay(iso('2026-10-10'), iso('2026-10-12'), periods, CLIMATE_FEE_SCHEDULE)).toThrow(RangeError);
  });
});

describe('climateFeeGroups', () => {
  const HIGH = [4, 5, 6, 7, 8, 9, 10];
  const LOW = [1, 2, 3, 11, 12];

  it('groups the fee by season across 1 November: 29 Oct to 3 Nov is 3 × 8 EUR and 2 × 2 EUR', () => {
    expect(climateFeeGroups(iso('2026-10-29'), iso('2026-11-03'), CLIMATE_FEE_SCHEDULE)).toEqual([
      { season: 'high', months: HIGH, cents: 800, nights: 3, amountCents: 2400 },
      { season: 'low', months: LOW, cents: 200, nights: 2, amountCents: 400 },
    ]);
  });

  it('groups the fee by season across 1 April', () => {
    expect(climateFeeGroups(iso('2027-03-30'), iso('2027-04-02'), CLIMATE_FEE_SCHEDULE)).toEqual([
      { season: 'low', months: LOW, cents: 200, nights: 2, amountCents: 400 },
      { season: 'high', months: HIGH, cents: 800, nights: 1, amountCents: 800 },
    ]);
  });

  it('adds up to the climate fee of the quote', () => {
    const groups = climateFeeGroups(iso('2026-10-13'), iso('2026-11-05'), CLIMATE_FEE_SCHEDULE);
    const quote = quoteStay(iso('2026-10-13'), iso('2026-11-05'), PERIODS, CLIMATE_FEE_SCHEDULE);
    expect(groups.reduce((sum, group) => sum + group.amountCents, 0)).toBe(quote.climateFeeCents);
  });

  it('keeps the nights of different fee rules apart', () => {
    const schedule: readonly ClimateFeeRule[] = [
      ...CLIMATE_FEE_SCHEDULE,
      { effectiveFrom: '2027-01-01', highSeasonMonths: HIGH, highCents: 1000, lowCents: 300, source: 'https://example.test/next-rule' },
    ];
    expect(climateFeeGroups(iso('2026-12-30'), iso('2027-01-02'), schedule)).toEqual([
      { season: 'low', months: LOW, cents: 200, nights: 2, amountCents: 400 },
      { season: 'low', months: LOW, cents: 300, nights: 1, amountCents: 300 },
    ]);
  });
});

describe('lowestNightlyPriceCents (the hero "from €X / night", identity §1.4)', () => {
  // TODAY is 2026-09-28: nights 0-2 (28-30 Sep) have no rate, night 3 is 1 Oct (OCTOBER_EARLY).
  const openNights = 'o'.repeat(AVAILABILITY_HORIZON_DAYS);

  it('is the lowest rate over the next 60 nights', () => {
    // 28 Sep + 60 nights ends on 27 Nov: OCTOBER_EARLY 8000, OCTOBER_LATE 9500, WINTER 6000.
    expect(lowestNightlyPriceCents(TODAY, openNights, PERIODS)).toBe(6000);
  });

  it('ignores rates that start after the 60-night window', () => {
    // 28 Sep + 34 nights ends on 1 Nov (exclusive): WINTER starts on it.
    expect(lowestNightlyPriceCents(TODAY, openNights, PERIODS, 34)).toBe(8000);
    expect(lowestNightlyPriceCents(TODAY, openNights, PERIODS, 35)).toBe(6000);
  });

  it('skips booked nights, and counts unknown nights (the rates still apply)', () => {
    const nights = 'u'.repeat(34) + 'b'.repeat(26);
    expect(lowestNightlyPriceCents(TODAY, nights, PERIODS)).toBe(8000);
  });

  it('is null without a rate on any bookable night', () => {
    expect(lowestNightlyPriceCents(TODAY, openNights, [])).toBeNull();
    expect(lowestNightlyPriceCents(TODAY, 'b'.repeat(60), PERIODS)).toBeNull();
    expect(lowestNightlyPriceCents(TODAY, openNights, PERIODS, 3)).toBeNull();
    expect(lowestNightlyPriceCents(TODAY, '', PERIODS)).toBeNull();
  });
});
