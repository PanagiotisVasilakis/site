import { useId } from 'react';

import { Callout } from '@/components/ui/Callout';
import { MAX_STAY_NIGHTS } from '@/data/stayPolicy';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { IsoDate } from '@/lib/availability/calendarDate';
import type { StayValidation } from '@/lib/availability/stayQuote';

import BookingOptions from './BookingOptions';
import { fill, formatStayDate, formatStayRange, nightsLabel } from './format';

type StaySummaryProps = {
  locale: Locale;
  checkIn: IsoDate | null;
  checkOut: IsoDate | null;
  /** validateStay of the complete selection; null until both dates are chosen. */
  validation: StayValidation | null;
  /** The check-in period's minimum stay, for the min_nights message. */
  minimumNights: number;
  /** The accepted stay, for the contact options. */
  stay?: Readonly<{ checkIn: IsoDate; checkOut: IsoDate }>;
};

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-card__line">
      <dt className="summary-card__label">{label}</dt>
      <dd className="summary-card__value">{value}</dd>
    </div>
  );
}

/**
 * identity §8 SummaryCard: the selected dates and nights, or why the stay is not possible; then the ways to book.
 */
export default function StaySummary({ locale, checkIn, checkOut, validation, minimumNights, stay }: StaySummaryProps) {
  const titleId = useId();
  const t = getDictionary(locale).availability;
  const nights = (count: number) => nightsLabel(count, t.nights, locale);
  const rejection = validation && !validation.ok
    ? fill(t.rejections[validation.reason], { max: MAX_STAY_NIGHTS, nights: nights(minimumNights) })
    : null;
  const accepted = validation?.ok ? validation : null;

  return (
    <section aria-labelledby={titleId} className="summary-card">
      <h3 id={titleId} className="summary-card__eyebrow">{t.summary.title}</h3>

      {checkIn === null ? <p className="summary-card__empty">{t.summary.empty}</p> : null}

      {accepted !== null ? (
        <>
          <p className="summary-card__dates">{formatStayRange(accepted.checkIn, accepted.checkOut, locale)}</p>
          <p className="summary-card__sub">
            <span>{`${formatStayDate(accepted.checkIn, locale)} – ${formatStayDate(accepted.checkOut, locale)}`}</span>
            {' · '}
            <span>{nights(accepted.nights)}</span>
            {' · '}
            <span>{t.summary.guests}</span>
          </p>
        </>
      ) : checkIn === null ? null : (
        <dl className="summary-card__lines">
          <Line label={t.summary.checkIn} value={formatStayDate(checkIn, locale)} />
          {checkOut === null ? null : <Line label={t.summary.checkOut} value={formatStayDate(checkOut, locale)} />}
        </dl>
      )}

      {rejection === null ? null : <Callout variant="warning" role="status">{rejection}</Callout>}

      <BookingOptions locale={locale} stay={stay} />
      <p className="summary-card__trust">{t.summary.trust}</p>
    </section>
  );
}
