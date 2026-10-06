// The Summer/Winter highlights (identity §8 SeasonSwitch, graft 10) follow the climate-fee seasons of
// src/data/stayPolicy.ts: the high-season months are "summer", every other month is "winter".

import type { ClimateFeeRule } from '@/data/stayPolicy';
import type { IsoDate } from '@/lib/availability/calendarDate';
import { climateFeeRuleOn } from '@/lib/availability/stayQuote';

export type Season = 'summer' | 'winter';

export type HomeSeasons = Readonly<{
  /** The season of the property's today. */
  current: Season;
  /** 'YYYY-MM': the first month of each season from today's month on (today's month for the current one). */
  firstMonth: Readonly<Record<Season, string>>;
}>;

/** Null when no climate-fee rule is in force on `today`: then the season switch is not shown. */
export function homeSeasonsOn(today: IsoDate, schedule: readonly ClimateFeeRule[]): HomeSeasons | null {
  const rule = climateFeeRuleOn(today, schedule);
  if (rule === null) return null;
  const seasonOf = (month: number): Season => (rule.highSeasonMonths.includes(month) ? 'summer' : 'winter');

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const firstMonth: Partial<Record<Season, string>> = {};
  for (let offset = 0; offset < 12; offset += 1) {
    const index = month - 1 + offset;
    const monthOfYear = (index % 12) + 1;
    const season = seasonOf(monthOfYear);
    firstMonth[season] ??= `${year + Math.floor(index / 12)}-${String(monthOfYear).padStart(2, '0')}`;
  }
  // A rule whose high season is empty or covers every month leaves one season without a month.
  if (firstMonth.summer === undefined || firstMonth.winter === undefined) return null;
  return { current: seasonOf(month), firstMonth: { summer: firstMonth.summer, winter: firstMonth.winter } };
}
