import { describe, expect, it } from 'vitest';

import { homeFromPriceCents, hoursSince, nextFreeNight, nightsTeaserFrom } from '@/components/home/homeNights';
import { HOME_POINT, reliefPins, reliefPoint } from '@/components/home/homeRelief';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

const TODAY = '2026-10-18' as IsoDate;

function availability(overrides: Partial<PublicAvailability> = {}): PublicAvailability {
  return {
    today: TODAY,
    horizonEnd: addDays(TODAY, 365),
    status: 'fresh',
    lastSyncedAt: '2026-10-18T06:00:00.000Z',
    // Tonight free, the 2nd and 3rd nights booked, then free.
    nights: `obb${'o'.repeat(362)}`,
    rates: [
      { start: TODAY, end: '2026-10-25' as IsoDate, nightlyPriceCents: 9000, minimumNights: 2 },
      { start: '2026-10-25' as IsoDate, end: '2026-12-01' as IsoDate, nightlyPriceCents: 8500, minimumNights: 2 },
    ],
    ...overrides,
  };
}

describe('nightsTeaserFrom (identity §8 NightsTeaser)', () => {
  it('describes the next 14 nights of a fresh calendar: state, price and the lowest-price pill', () => {
    const teaser = nightsTeaserFrom(availability());

    expect(teaser).not.toBeNull();
    expect(teaser?.cells).toHaveLength(14);
    expect(teaser?.cells.slice(0, 4).map((cell) => [cell.date, cell.state, cell.priceCents, cell.best])).toEqual([
      ['2026-10-18', 'open', 9000, false],
      ['2026-10-19', 'booked', null, false],
      ['2026-10-20', 'booked', null, false],
      ['2026-10-21', 'open', 9000, false],
    ]);
    // 25 Oct onwards costs 85 €: those cells carry the pill.
    expect(teaser?.cells.filter((cell) => cell.best).map((cell) => cell.date)).toEqual(
      Array.from({ length: 7 }, (_, index) => addDays('2026-10-25' as IsoDate, index)),
    );
    expect(teaser?.stale).toBe(false);
    expect(teaser?.fromPriceCents).toBe(8500);
    expect(teaser?.lowestFrom).toBe('2026-10-25');
  });

  it('shows a stale calendar as prices only, every night unknown', () => {
    const teaser = nightsTeaserFrom(availability({ status: 'stale', nights: 'u'.repeat(365) }));

    expect(teaser?.stale).toBe(true);
    expect(teaser?.cells.every((cell) => cell.state === 'unknown' && cell.priceCents !== null)).toBe(true);
  });

  it.each(['not_configured', 'unavailable'] as const)('is not rendered for %s data', (status) => {
    expect(nightsTeaserFrom(availability({ status }))).toBeNull();
  });

  it('is not rendered when no cell says anything (stale and no rates)', () => {
    expect(nightsTeaserFrom(availability({ status: 'stale', nights: 'u'.repeat(365), rates: [] }))).toBeNull();
  });

  it('keeps a fresh calendar without rates: free and booked nights, no price and no pill', () => {
    const teaser = nightsTeaserFrom(availability({ rates: [] }));

    expect(teaser?.cells.every((cell) => cell.priceCents === null && !cell.best)).toBe(true);
    expect(teaser?.fromPriceCents).toBeNull();
    expect(teaser?.lowestFrom).toBeNull();
  });
});

describe('home availability helpers', () => {
  it('takes the "from" price over the next 60 nights that can be booked (§1.4)', () => {
    expect(homeFromPriceCents(availability())).toBe(8500);
    expect(homeFromPriceCents(availability({ rates: [] }))).toBeNull();
  });

  it('names tonight or the next free night, only from a fresh calendar', () => {
    expect(nextFreeNight(availability())).toEqual({ tonight: true, date: '2026-10-18' });
    expect(nextFreeNight(availability({ nights: `bbo${'o'.repeat(362)}` }))).toEqual({ tonight: false, date: '2026-10-20' });
    expect(nextFreeNight(availability({ nights: 'b'.repeat(365) }))).toBeNull();
    expect(nextFreeNight(availability({ status: 'stale', nights: 'u'.repeat(365) }))).toBeNull();
  });

  it('counts whole hours since the last sync', () => {
    const now = new Date('2026-10-18T20:59:00.000Z');
    expect(hoursSince('2026-10-18T06:00:00.000Z', now)).toBe(14);
    expect(hoursSince(null, now)).toBeNull();
    expect(hoursSince('not a date', now)).toBeNull();
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
