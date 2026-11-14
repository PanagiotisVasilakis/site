import type { CSSProperties } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';

import { DAY_PICKER_LOCALES } from '@/components/availability/format';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { toLocalDate, type IsoDate } from '@/lib/availability/calendarDate';

import type { NightCell } from './homeNights';

function dateText(date: IsoDate, pattern: string, locale: Locale): string {
  return format(toLocalDate(date), pattern, { locale: DAY_PICKER_LOCALES[locale] });
}

/** The cell's accessible name: the full date, then "booked" for a booked night (a free night is named by its date alone). */
function cellName(cell: NightCell, locale: Locale): string {
  const date = dateText(cell.date, 'EEEE d MMMM', locale);
  return cell.booked ? `${date}, ${getDictionary(locale).availability.day.booked}` : date;
}

/**
 * identity §8 NightsTeaser, §9.1 item 7: the next 14 nights from the availability repository (7 columns
 * on mobile in two rows, 14 at lg), free or booked, with no price. Rendered by the page only with a fresh
 * calendar that knows every night (nightsTeaserFrom). Motion M13: the cells flip in once in view.
 */
export default function NightsTeaser({ cells, locale }: { cells: readonly NightCell[]; locale: Locale }) {
  const t = getDictionary(locale);
  const copy = t.home.nights;
  const hasBooked = cells.some((cell) => cell.booked);

  return (
    <Section id="nights" className="teaser" eyebrow={copy.eyebrow} title={copy.title}>
      <ol className="nights" aria-label={copy.title} data-reveal>
        {cells.map((cell, index) => (
          <li key={cell.date} className={cell.booked ? 'night night--booked' : 'night'} style={{ '--i': index } as CSSProperties}>
            <span className="sr-only">{cellName(cell, locale)}</span>
            <span className="night__dow" aria-hidden="true">{dateText(cell.date, 'EEE', locale)}</span>
            <span className="night__d" aria-hidden="true">{dateText(cell.date, 'd', locale)}</span>
          </li>
        ))}
      </ol>
      <div className="teaser__foot" data-cta-watch>
        {hasBooked ? (
          <p className="teaser__legend">
            <span className="teaser__legend-item">
              <span className="teaser__swatch teaser__swatch--booked" aria-hidden="true" />
              {t.availability.day.booked}
            </span>
          </p>
        ) : null}
        <Button asChild variant="primary">
          <Link href={`/${locale}/availability`}>
            {copy.cta}
            <Icon name="arrow-right" size={20} className="ui-btn__arrow" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}
