import { Button } from '@/components/ui';
import { AIRBNB_LISTING_URL } from '@/data/contact';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { IsoDate } from '@/lib/availability/calendarDate';
import { formatCentsShort } from '@/lib/availability/money';
import type { StayQuote } from '@/lib/availability/stayQuote';
import { airbnbListingHref, isAirbnbListingUrl } from '@/lib/contactLinks';

import { fill, nightsLabel } from './format';

type QuoteBarProps = {
  locale: Locale;
  /** The quote of an accepted stay. */
  quote: StayQuote;
  stay: Readonly<{ checkIn: IsoDate; checkOut: IsoDate }>;
  /** Brings the SummaryCard into view (when there is no Airbnb listing). */
  onDetails: () => void;
};

/**
 * identity §8 QuoteBar (below lg): a glass pill with the total of a complete
 * stay and "Book on Airbnb", or "See details" without a listing URL. The
 * planner renders it only while the SummaryCard is out of view.
 */
export default function QuoteBar({ locale, quote, stay, onDetails }: QuoteBarProps) {
  const t = getDictionary(locale).availability;
  const nights = nightsLabel(quote.nights, t.nights, locale);
  const text = quote.priceOnRequest
    ? fill(t.quoteBar.priceOnRequest, { nights })
    : fill(t.quoteBar.total, { price: formatCentsShort(quote.totalCents, locale), nights });

  return (
    <aside className="quote-bar" aria-label={t.quoteBar.label}>
      <p className="quote-bar__text">{text}</p>
      {isAirbnbListingUrl(AIRBNB_LISTING_URL) ? (
        <Button asChild variant="primary" size="sm">
          <a href={airbnbListingHref(AIRBNB_LISTING_URL, stay)} target="_blank" rel="noopener noreferrer">
            {t.booking.airbnb}
            {' '}
            <span className="sr-only">{t.booking.opensInNewTab}</span>
          </a>
        </Button>
      ) : (
        <Button type="button" variant="primary" size="sm" onClick={onDetails}>
          {t.quoteBar.details}
        </Button>
      )}
    </aside>
  );
}
