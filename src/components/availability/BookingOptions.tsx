import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui';
import { HOST_CONTACT } from '@/data/contact';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import type { IsoDate } from '@/lib/availability/calendarDate';
import { bookingComHref, telHref } from '@/lib/contactLinks';
import { whatsappHref } from '@/lib/whatsapp';

import { fill, formatStayDate } from './format';

type BookingOptionsProps = {
  locale: Locale;
  /** A stay that passed validateStay; its dates, and nothing else, go into the WhatsApp text. */
  stay?: Readonly<{ checkIn: IsoDate; checkOut: IsoDate }>;
};

/**
 * The ways to book: the Booking.com listing link (the primary button; only while the link is valid), a
 * call, or a WhatsApp message. Plain links: nothing is sent to this site.
 */
export default function BookingOptions({ locale, stay }: BookingOptionsProps) {
  const t = getDictionary(locale).availability.booking;
  const bookingHref = bookingComHref();
  const message = stay
    ? fill(t.whatsappMessage, { checkin: formatStayDate(stay.checkIn, locale), checkout: formatStayDate(stay.checkOut, locale) })
    : undefined;

  return (
    <div className="booking-options">
      {bookingHref ? (
        <Button asChild variant="primary" block>
          <a href={bookingHref} target="_blank" rel="noopener noreferrer">
            {t.bookingCom}
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
