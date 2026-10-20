import { describe, expect, it } from 'vitest';

import { nextFreeNight, nightsTeaserFrom } from '@/components/home/homeNights';
import { HOME_POINT, reliefPins, reliefPoint } from '@/components/home/homeRelief';
import type { IsoDate } from '@/lib/availability/calendarDate';

const TODAY = '2026-10-18' as IsoDate;

type Calendar = Parameters<typeof nightsTeaserFrom>[0];

function availability(overrides: Partial<Calendar> = {}): Calendar {
  return {
    today: TODAY,
    status: 'fresh',
    // Tonight free, the 2nd and 3rd nights booked, then free.
    nights: `obb${'o'.repeat(362)}`,
    ...overrides,
  };
}

describe('nightsTeaserFrom (identity §8 NightsTeaser)', () => {
  it('describes the next 14 nights of a fresh calendar: the date and whether it is booked', () => {
    const cells = nightsTeaserFrom(availability());

    expect(cells).toHaveLength(14);
    expect(cells?.slice(0, 4)).toEqual([
      { date: '2026-10-18', booked: false },
      { date: '2026-10-19', booked: true },
      { date: '2026-10-20', booked: true },
      { date: '2026-10-21', booked: false },
    ]);
    expect(cells?.at(-1)).toEqual({ date: '2026-10-31', booked: false });
  });

  it.each([
    ['a stale calendar', { status: 'stale', nights: 'u'.repeat(365) }],
    ['an unconfigured calendar', { status: 'not_configured', nights: 'u'.repeat(365) }],
    ['an unavailable read', { status: 'unavailable' }],
    ['a fresh calendar with an unknown night in the window', { nights: `ooooo${'u'}${'o'.repeat(359)}` }],
  ] as const)('is not rendered for %s', (_name, overrides) => {
    expect(nightsTeaserFrom(availability(overrides))).toBeNull();
  });
});

describe('nextFreeNight (BookBar note)', () => {
  it('names tonight or the next free night, only from a fresh calendar', () => {
    expect(nextFreeNight(availability())).toEqual({ tonight: true, date: '2026-10-18' });
    expect(nextFreeNight(availability({ nights: `bbo${'o'.repeat(362)}` }))).toEqual({ tonight: false, date: '2026-10-20' });
    expect(nextFreeNight(availability({ nights: 'b'.repeat(365) }))).toBeNull();
    // Tonight is free in this data: the stale status alone hides it.
    expect(nextFreeNight(availability({ status: 'stale' }))).toBeNull();
  });
});

describe('relief pins (identity §8 LocationRelief)', () => {
  it('projects the guide coordinates into the plan', () => {
    expect(reliefPoint([22.075, 37.05])).toEqual({ left: 0, top: 0 });
    expect(reliefPoint([22.13, 37.0205])).toEqual({ left: 100, top: 100 });
    expect(reliefPoint([30, 10])).toEqual({ left: 100, top: 100 });
  });

  it('pins the rows that have coordinates in the guide data, the apartment west of the centre', () => {
    const pins = reliefPins(['townHall', 'bus', 'beach', 'centre', 'museum', 'airport'], 'en');

    expect(pins.map((pin) => pin.key)).toEqual(['beach', 'centre', 'museum']);
    for (const pin of [...pins, HOME_POINT]) {
      expect(pin.left).toBeGreaterThan(0);
      expect(pin.left).toBeLessThan(100);
      expect(pin.top).toBeGreaterThan(0);
      expect(pin.top).toBeLessThan(100);
    }
    const centre = pins.find((pin) => pin.key === 'centre');
    const beach = pins.find((pin) => pin.key === 'beach');
    expect(HOME_POINT.left).toBeLessThan(centre?.left ?? 0);
    expect(beach?.top ?? 0).toBeGreaterThan(HOME_POINT.top);
  });
});
