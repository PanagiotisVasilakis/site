import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { addDays, nightsBetween } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

import { formatStayDate } from './format';
import { nightCodeOn } from './plannerState';

/** How many nights the static list shows (identity §9.3). */
const LISTED_NIGHTS = 60;

/**
 * The next nights as free or "booked", as plain text: the page renders it inside <noscript>, for browsers
 * where the calendar cannot run. The page renders it only for a fresh calendar, which knows the first 60
 * nights, so a night that is not booked is free.
 */
export default function NightsList({ locale, availability }: { locale: Locale; availability: PublicAvailability }) {
  const t = getDictionary(locale).availability;
  const { today, horizonEnd, nights } = availability;
  const count = Math.min(LISTED_NIGHTS, nightsBetween(today, horizonEnd));

  return (
    <section aria-labelledby="nights-list-title" className="nights-list">
      <h3 id="nights-list-title" className="nights-list__title">{t.noJs.title}</h3>
      <ul className="nights-list__items">
        {Array.from({ length: count }, (_, index) => {
          const night = addDays(today, index);
          const status = nightCodeOn(night, today, nights) === 'b' ? t.day.booked : t.legend.free;
          return (
            <li key={night} className="nights-list__item">
              <span>{formatStayDate(night, locale)}</span>
              <span className="nights-list__status">{status}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
