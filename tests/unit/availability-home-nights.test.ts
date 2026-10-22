import { describe, expect, it } from 'vitest';

import { nextFreeNight } from '@/components/home/homeNights';
import { MAX_STAY_NIGHTS } from '@/data/stayPolicy';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import type { RatePeriod } from '@/lib/availability/stayQuote';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

const TODAY = '2026-10-18' as IsoDate;
const NIGHTS = 365;

type View = Pick<PublicAvailability, 'today' | 'status' | 'nights' | 'rates'>;

function period(start: string, end: string, minimumNights: number): RatePeriod {
  return { start: start as IsoDate, end: end as IsoDate, minimumNights };
}

/** A fresh calendar for TODAY: `lead` first, then free nights up to the 365th. */
function view(lead: string, overrides: Partial<View> = {}): View {
  return {
    today: TODAY,
    status: 'fresh',
    nights: lead.padEnd(NIGHTS, 'o'),
    rates: [],
    ...overrides,
  };
}

describe('nextFreeNight: the minimum stay of the availability page', () => {
  it('names tonight when a stay of the minimum fits from tonight', () => {
    // Free 18, 19 and 20 October, booked on the 21st: the 3-night minimum fits exactly.
    const rates = [period('2026-10-01', '2026-12-01', 3)];

    expect(nextFreeNight(view('oooboo', { rates }))).toEqual({ tonight: true, date: '2026-10-18' });
  });

  it('skips free nights where the minimum stay does not fit before the next booked night', () => {
    // 18 and 19 October are free but the 20th is booked: neither can start a 3-night stay. 21st is the first that can.
    const rates = [period('2026-10-01', '2026-12-01', 3)];

    expect(nextFreeNight(view('ooboo', { rates }))).toEqual({ tonight: false, date: '2026-10-21' });
  });

  it('applies the minimum of the rate period that holds the check-in night', () => {
    // Free 18, 19, booked 20. Minimum 3 until 20 October, 1 night from 21 October on: the 21st is the first night
    // that can start a stay (the 18th and 19th are in the 3-night period).
    const rates = [period('2026-10-01', '2026-10-21', 3), period('2026-10-21', '2026-12-01', 1)];

    expect(nextFreeNight(view('oob', { rates }))).toEqual({ tonight: false, date: '2026-10-21' });
    // In a 1-night period the isolated free night can start a stay.
    expect(nextFreeNight(view('oob', { rates: [period('2026-10-01', '2026-12-01', 1)] }))).toEqual({
      tonight: true,
      date: '2026-10-18',
    });
  });

  it('applies the default minimum stay to a night outside every rate period', () => {
    expect(nextFreeNight(view('bbo', { rates: [period('2026-12-01', '2027-01-01', 5)] }))).toEqual({
      tonight: false,
      date: '2026-10-20',
    });
  });

  it('skips every isolated free night of a run of alternating free and booked nights', () => {
    // Free and booked nights alternate up to the booked 25 October, so no 2-night stay fits before the free
    // run that starts on the 26th.
    const rates = [period('2026-10-01', '2026-12-01', 2)];

    expect(nextFreeNight(view('obobobob', { rates }))).toEqual({ tonight: false, date: '2026-10-26' });
  });

  it('is null when no night in the calendar can start a stay of the minimum', () => {
    const everyOther = 'ob'.repeat(NIGHTS).slice(0, NIGHTS);
    const rates = [period('2026-10-01', '2028-01-01', 2)];

    expect(nextFreeNight(view(everyOther, { rates }))).toBeNull();
    // Without a minimum above one night the same calendar still has free nights.
    expect(nextFreeNight(view(everyOther))).toEqual({ tonight: true, date: '2026-10-18' });
  });

  it('is null when every night is booked', () => {
    expect(nextFreeNight(view('b'.repeat(NIGHTS)))).toBeNull();
  });

  it('never names a night when the minimum is longer than the longest stay', () => {
    const rates = [period('2026-10-01', '2028-01-01', MAX_STAY_NIGHTS + 1)];

    expect(nextFreeNight(view('', { rates }))).toBeNull();
    expect(nextFreeNight(view('', { rates: [period('2026-10-01', '2028-01-01', MAX_STAY_NIGHTS)] }))).toEqual({
      tonight: true,
      date: '2026-10-18',
    });
  });

  it('names the last night of the calendar only when a stay of its minimum ends by the horizon', () => {
    const onlyLastFree = view('b'.repeat(NIGHTS - 1));
    const lastNight = addDays(TODAY, NIGHTS - 1);

    expect(nextFreeNight(onlyLastFree)).toEqual({ tonight: false, date: lastNight });
    expect(nextFreeNight({ ...onlyLastFree, rates: [period('2026-10-01', '2028-01-01', 2)] })).toBeNull();
  });

  it('names only a night known to be free', () => {
    // An unknown night inside a fresh calendar is not advertised, though the planner would not block it.
    expect(nextFreeNight(view('uuo'))).toEqual({ tonight: false, date: '2026-10-20' });
  });

  it.each(['stale', 'not_configured', 'unavailable'] as const)('is null for a %s calendar whatever the nights say', (status) => {
    expect(nextFreeNight(view('', { status }))).toBeNull();
  });

  it('treats a view without rate periods as having the default minimum stay everywhere', () => {
    const withoutRates = { today: TODAY, status: 'fresh', nights: 'bbo'.padEnd(NIGHTS, 'o') } as const;

    expect(nextFreeNight(withoutRates)).toEqual({ tonight: false, date: '2026-10-20' });
  });
});
