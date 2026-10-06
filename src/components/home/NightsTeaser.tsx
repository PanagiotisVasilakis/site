import type { CSSProperties } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';

import { DAY_PICKER_LOCALES, fill } from '@/components/availability/format';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { toLocalDate, type IsoDate } from '@/lib/availability/calendarDate';
import { formatCentsShort } from '@/lib/availability/money';

import { hoursSince, type NightCell, type NightsTeaser as NightsTeaserData } from './homeNights';

function dateText(date: IsoDate, pattern: string, locale: Locale): string {
  return format(toLocalDate(date), pattern, { locale: DAY_PICKER_LOCALES[locale] });
}

/** The cell's accessible name: the full date, then the price, "booked" or "price on request". */
function cellName(cell: NightCell, locale: Locale): string {
  const t = getDictionary(locale);
  const day = t.availability.day;
  const parts = [dateText(cell.date, 'EEEE d MMMM', locale)];
  if (cell.state === 'booked') parts.push(day.booked);
  else if (cell.priceCents === null) parts.push(day.priceOnRequest);
  else parts.push(fill(day.perNight, { price: formatCentsShort(cell.priceCents, locale) }));
  if (cell.best) parts.push(t.home.nights.legendBest);
  return parts.join(', ');
}

function StaleNote({ data, locale, now }: { data: NightsTeaserData; locale: Locale; now: Date }) {
  const t = getDictionary(locale);
  const hours = hoursSince(data.lastSyncedAt, now);
  const forms = t.home.nights.staleUpdated;
  const text = hours === null
    ? t.availability.status.stale
    : fill(new Intl.PluralRules(locale).select(hours) === 'one' ? forms.one : forms.other, { count: hours });
  return <p className="teaser__stale" role="note">{text}</p>;
}

/**
 * identity §8 NightsTeaser, §9.1 item 7: the next 14 nights from the availability repository (7 columns
 * on mobile in two rows, 14 at lg). Rendered by the page only with fresh or stale data (nightsTeaserFrom);
 * a stale calendar shows no booked nights and says so. Motion M13: the cells flip in once in view.
 */
export default function NightsTeaser({ data, locale, now }: { data: NightsTeaserData; locale: Locale; now: Date }) {
  const t = getDictionary(locale);
  const copy = t.home.nights;
  const [before, after] = t.home.heroPriceFrom.split('{price}');
  const hasBooked = data.cells.some((cell) => cell.state === 'booked');
  const hasBest = data.cells.some((cell) => cell.best);

  return (
    <Section id="nights" className="teaser" eyebrow={copy.eyebrow} title={copy.title}>
      {data.fromPriceCents === null ? null : (
        <p className="teaser__price">
          {before}
          <strong className="teaser__price-value">{formatCentsShort(data.fromPriceCents, locale)}</strong>
          {after}
          {data.lowestFrom === null ? null : (
            <span className="teaser__price-note">
              {fill(copy.lowestFrom, { date: dateText(data.lowestFrom, 'EEE d MMM', locale) })}
            </span>
          )}
        </p>
      )}
      {data.stale ? <StaleNote data={data} locale={locale} now={now} /> : null}
      <ol className="nights" aria-label={copy.listLabel} data-reveal>
        {data.cells.map((cell, index) => (
          <li
            key={cell.date}
            className={`night night--${cell.state}${cell.best ? ' night--best' : ''}`}
            style={{ '--i': index } as CSSProperties}
          >
            <span className="sr-only">{cellName(cell, locale)}</span>
            <span className="night__dow" aria-hidden="true">{dateText(cell.date, 'EEE', locale)}</span>
            <span className="night__d" aria-hidden="true">{dateText(cell.date, 'd', locale)}</span>
            <span className="night__p" aria-hidden="true">
              {cell.priceCents === null ? '—' : formatCentsShort(cell.priceCents, locale)}
            </span>
          </li>
        ))}
      </ol>
      <div className="teaser__foot" data-cta-watch>
        {hasBest || hasBooked ? (
          <p className="teaser__legend">
            {hasBest ? (
              <span className="teaser__legend-item">
                <span className="teaser__swatch teaser__swatch--best" aria-hidden="true" />
                {copy.legendBest}
              </span>
            ) : null}
            {hasBooked ? (
              <span className="teaser__legend-item">
                <span className="teaser__swatch teaser__swatch--booked" aria-hidden="true" />
                {t.availability.day.booked}
              </span>
            ) : null}
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
