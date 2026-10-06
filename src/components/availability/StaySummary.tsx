import { useId, type Ref } from 'react';

import { Callout } from '@/components/ui/Callout';
import { AIRBNB_LISTING_URL } from '@/data/contact';
import { MAX_STAY_NIGHTS } from '@/data/stayPolicy';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { IsoDate } from '@/lib/availability/calendarDate';
import { formatCentsShort } from '@/lib/availability/money';
import type { ClimateFeeGroup, StayQuote, StayValidation } from '@/lib/availability/stayQuote';
import { isAirbnbListingUrl } from '@/lib/contactLinks';

import BookingOptions from './BookingOptions';
import { describeMonths, fill, formatStayDate, formatStayRange, nightsLabel } from './format';

type StaySummaryProps = {
  locale: Locale;
  checkIn: IsoDate | null;
  checkOut: IsoDate | null;
  /** validateStay of the complete selection; null until both dates are chosen. */
  validation: StayValidation | null;
  /** quoteStay of an accepted stay. */
  quote: StayQuote | null;
  /** climateFeeGroups of an accepted stay (empty otherwise). */
  feeGroups: readonly ClimateFeeGroup[];
  /** The check-in period's minimum stay, for the min_nights message. */
  minimumNights: number;
  /** The accepted stay, for the contact options. */
  stay?: Readonly<{ checkIn: IsoDate; checkOut: IsoDate }>;
  ref?: Ref<HTMLElement>;
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
 * identity §8 SummaryCard: the selected dates, nights grouped by price, the
 * climate fee grouped by season and the total, or why the stay is not
 * possible; then the ways to book.
 */
export default function StaySummary({
  locale, checkIn, checkOut, validation, quote, feeGroups, minimumNights, stay, ref,
}: StaySummaryProps) {
  const titleId = useId();
  const t = getDictionary(locale).availability;
  const price = (cents: number) => formatCentsShort(cents, locale);
  const nights = (count: number) => nightsLabel(count, t.nights, locale);
  const rejection = validation && !validation.ok
    ? fill(t.rejections[validation.reason], { max: MAX_STAY_NIGHTS, nights: nights(minimumNights) })
    : null;
  const accepted = validation?.ok ? validation : null;

  const feeLine = quote === null ? null : (
    <div className="summary-card__line">
      <dt className="summary-card__label">{t.summary.climateFee}</dt>
      <dd className="summary-card__value">{price(quote.climateFeeCents)}</dd>
      <dd className="summary-card__detail">
        {feeGroups.map((group) => (
          <span key={`${group.season}-${group.cents}`}>
            {`${group.nights} × ${price(group.cents)} ${describeMonths(group.months, locale, 'short')}`}
          </span>
        ))}
      </dd>
    </div>
  );

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby={titleId} className="summary-card">
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

      {quote === null ? null : quote.priceOnRequest ? (
        <>
          <p className="summary-card__request">{t.summary.priceOnRequest}</p>
          <p className="summary-card__fine">{t.summary.priceOnRequestNote}</p>
          <dl className="summary-card__lines">{feeLine}</dl>
        </>
      ) : (
        <>
          <dl className="summary-card__lines">
            {quote.groups.map((group) => (
              <Line
                key={group.nightlyPriceCents}
                label={fill(t.summary.priceGroup, { nights: nights(group.nights), price: price(group.nightlyPriceCents) })}
                value={price(group.amountCents)}
              />
            ))}
            <Line label={t.summary.subtotal} value={price(quote.subtotalCents)} />
            {feeLine}
          </dl>
          <div className="summary-card__total">
            <span>{t.summary.total}</span>
            {/* Keyed by the amount so the M20 bump runs again when the total changes. */}
            <span key={quote.totalCents} className="summary-card__total-value">{price(quote.totalCents)}</span>
          </div>
        </>
      )}

      {quote === null ? null : <p className="summary-card__fine">{t.summary.finePrint}</p>}

      <BookingOptions locale={locale} stay={stay} />
      <p className="summary-card__trust">{isAirbnbListingUrl(AIRBNB_LISTING_URL) ? t.summary.trustAirbnb : t.summary.trust}</p>
    </section>
  );
}
