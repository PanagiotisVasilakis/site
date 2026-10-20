// The Summer/Winter highlights (identity §8 SeasonSwitch, graft 10): April to October is "summer", every
// other month is "winter", as the labels "Summer (Apr–Oct)" and "Winter (Nov–Mar)" in
// src/i18n/domains/home.ts say.

import type { IsoDate } from '@/lib/availability/calendarDate';

export type Season = 'summer' | 'winter';

export type HomeSeasons = Readonly<{
  /** The season of the property's today. */
  current: Season;
  /** 'YYYY-MM': the first month of each season from today's month on (today's month for the current one). */
  firstMonth: Readonly<Record<Season, string>>;
}>;

// Keep in step with the season labels in src/i18n/domains/home.ts.
const SUMMER_MONTHS: readonly number[] = [4, 5, 6, 7, 8, 9, 10];

const seasonOf = (month: number): Season => (SUMMER_MONTHS.includes(month) ? 'summer' : 'winter');

/** The season of the property's today and the first month of each season from today's month on. */
export function homeSeasonsOn(today: IsoDate): HomeSeasons {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const firstMonth: Record<Season, string> = { summer: '', winter: '' };
  for (let offset = 0; offset < 12; offset += 1) {
    const index = month - 1 + offset;
    const monthOfYear = (index % 12) + 1;
    const season = seasonOf(monthOfYear);
    if (firstMonth[season] === '') {
      firstMonth[season] = `${year + Math.floor(index / 12)}-${String(monthOfYear).padStart(2, '0')}`;
    }
  }
  return { current: seasonOf(month), firstMonth };
}
