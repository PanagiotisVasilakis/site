// The home page's availability views (identity §8 NightsTeaser and BookBar), computed on the server
// from the F09 availability repository only (§1.4): no number is shown that the data does not hold.

import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import { lowestNightlyPriceCents, rateForNight } from '@/lib/availability/stayQuote';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

/** The "from €X" window (§1.4: the lowest rate over the next 60 nights that can be booked). */
const FROM_PRICE_WINDOW_NIGHTS = 60;
const TEASER_NIGHTS = 14;

export type NightState = 'open' | 'booked' | 'unknown';

export type NightCell = Readonly<{
  date: IsoDate;
  /** 'unknown' when the calendar is stale: the night may be booked. */
  state: NightState;
  /** Null for a booked night or a night without a rate. */
  priceCents: number | null;
  /** The lowest price among the cells (the `cal-best` pill). */
  best: boolean;
}>;

export type NightsTeaser = Readonly<{
  cells: readonly NightCell[];
  stale: boolean;
  lastSyncedAt: string | null;
  /** The "from €X / night" price and the first night it applies to, when a rate exists. */
  fromPriceCents: number | null;
  lowestFrom: IsoDate | null;
}>;

const STATES: Record<string, NightState> = { o: 'open', b: 'booked' };

/** The "from €X / night" price of the hero, the teaser and the BookBar; null without rates. */
export function homeFromPriceCents(availability: PublicAvailability): number | null {
  return lowestNightlyPriceCents(availability.today, availability.nights, availability.rates, FROM_PRICE_WINDOW_NIGHTS);
}

/**
 * The next 14 nights, or null when the teaser is not rendered: only fresh or stale data is shown
 * (§8), and only when at least one cell says something (a price, or a known free or booked night).
 */
export function nightsTeaserFrom(availability: PublicAvailability): NightsTeaser | null {
  if (availability.status !== 'fresh' && availability.status !== 'stale') return null;

  const count = Math.min(TEASER_NIGHTS, availability.nights.length);
  const raw = Array.from({ length: count }, (_, index) => {
    const date = addDays(availability.today, index);
    const state = STATES[availability.nights[index]] ?? 'unknown';
    const priceCents = state === 'booked' ? null : rateForNight(date, availability.rates)?.nightlyPriceCents ?? null;
    return { date, state, priceCents };
  });
  if (!raw.some((cell) => cell.priceCents !== null || cell.state !== 'unknown')) return null;

  const prices = raw.flatMap((cell) => (cell.priceCents === null ? [] : [cell.priceCents]));
  const lowest = prices.length > 0 ? Math.min(...prices) : null;
  const fromPriceCents = homeFromPriceCents(availability);

  return {
    cells: raw.map((cell) => ({ ...cell, best: lowest !== null && cell.priceCents === lowest })),
    stale: availability.status === 'stale',
    lastSyncedAt: availability.lastSyncedAt,
    fromPriceCents,
    lowestFrom: fromPriceCents === null ? null : firstNightAt(availability, fromPriceCents),
  };
}

function firstNightAt(availability: PublicAvailability, cents: number): IsoDate | null {
  const count = Math.min(FROM_PRICE_WINDOW_NIGHTS, availability.nights.length);
  for (let index = 0; index < count; index += 1) {
    if (availability.nights[index] === 'b') continue;
    const night = addDays(availability.today, index);
    if (rateForNight(night, availability.rates)?.nightlyPriceCents === cents) return night;
  }
  return null;
}

/** BookBar's second line: tonight or the next free night, only from a fresh calendar. */
export type NextFreeNight = Readonly<{ tonight: boolean; date: IsoDate }>;

export function nextFreeNight(availability: PublicAvailability): NextFreeNight | null {
  if (availability.status !== 'fresh') return null;
  const index = availability.nights.indexOf('o');
  if (index < 0) return null;
  return { tonight: index === 0, date: addDays(availability.today, index) };
}

/** Whole hours since the last sync, for the stale note; null without a sync time. */
export function hoursSince(lastSyncedAt: string | null, now: Date): number | null {
  if (lastSyncedAt === null) return null;
  const synced = Date.parse(lastSyncedAt);
  if (!Number.isFinite(synced)) return null;
  return Math.max(0, Math.floor((now.getTime() - synced) / 3_600_000));
}
