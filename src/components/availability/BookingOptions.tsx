import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui';
import { AIRBNB_LISTING_URL, HOST_CONTACT } from '@/data/contact';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { IsoDate } from '@/lib/availability/calendarDate';
import { airbnbListingHref, isAirbnbListingUrl, telHref } from '@/lib/contactLinks';
import { whatsappHref } from '@/lib/whatsapp';

import { fill, formatStayDate } from './format';

type BookingOptionsProps = {
  locale: Locale;
  /** A stay that passed validateStay; its dates, and nothing else, go into the WhatsApp text. */
  stay?: Readonly<{ checkIn: IsoDate; checkOut: IsoDate }>;
};

/**
 * The ways to book: Airbnb (only with a valid listing URL), a call, or a
 * WhatsApp message. Plain links: nothing is sent to this site.
 */
export default function BookingOptions({ locale, stay }: BookingOptionsProps) {
  const t = getDictionary(locale).availability.booking;
  const message = stay
    ? fill(t.whatsappMessage, { checkin: formatStayDate(stay.checkIn, locale), checkout: formatStayDate(stay.checkOut, locale) })
    : undefined;

  return (
    <div className="booking-options">
      {isAirbnbListingUrl(AIRBNB_LISTING_URL) ? (
        <Button asChild variant="primary" block>
          <a href={airbnbListingHref(AIRBNB_LISTING_URL, stay)} target="_blank" rel="noopener noreferrer">
            {t.airbnb}
            {' '}
            <span className="sr-only">{t.opensInNewTab}</span>
            <Icon name="arrow-up-right" size={18} />
          </a>
        </Button>
      ) : null}
      <div className="booking-options__row">
        <Button asChild variant="secondary">
          <a href={telHref(HOST_CONTACT.phone)}>
            <Icon name="phone" size={18} />
            {t.call}
          </a>
        </Button>
        <Button asChild variant="secondary">
          <a href={whatsappHref(HOST_CONTACT.phone, message)} target="_blank" rel="noopener noreferrer">
            <Icon name="message" size={18} />
            {t.whatsapp}
            {' '}
            <span className="sr-only">{t.opensInNewTab}</span>
          </a>
        </Button>
      </div>
    </div>
  );
}
