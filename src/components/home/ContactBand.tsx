import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { AIRBNB_LISTING_URL, HOST_CONTACT } from '@/data/contact';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { airbnbListingHref, isAirbnbListingUrl, telHref } from '@/lib/contactLinks';

/**
 * identity §8 ContactBand, §9.1 item 12 (`id="contact"`, the target of every "Contact" link). Warm band:
 * "Book on Airbnb" only with a valid listing URL; WhatsApp and Call as text plus icon (never icon-only);
 * e-mail and Instagram from HOST_CONTACT. No dates here, so the WhatsApp link is the plain chat (F09 rule).
 */
export default function ContactBand({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const booking = t.availability.booking;
  const copy = t.home.contact;
  const tel = telHref(HOST_CONTACT.phone);

  return (
    <Section
      id="contact"
      variant="warm"
      className="contact"
      eyebrow={copy.eyebrow}
      title={<>{copy.title} <em className="ui-section__em">{copy.titleEm}</em></>}
    >
      <div className="contact__actions" data-cta-watch>
        {isAirbnbListingUrl(AIRBNB_LISTING_URL) ? (
          <Button asChild variant="on-band" size="lg">
            <a href={airbnbListingHref(AIRBNB_LISTING_URL)} target="_blank" rel="noopener noreferrer">
              {booking.airbnb}
              <Icon name="arrow-up-right" size={20} />{' '}
              <span className="sr-only">{booking.opensInNewTab}</span>
            </a>
          </Button>
        ) : null}
        <Button asChild variant="outline-on-band">
          <a href={HOST_CONTACT.whatsapp} target="_blank" rel="noopener noreferrer">
            <Icon name="message" size={20} />
            {booking.whatsapp}{' '}
            <span className="sr-only">{booking.opensInNewTab}</span>
          </a>
        </Button>
        {tel ? (
          <Button asChild variant="outline-on-band">
            <a href={tel}>
              <Icon name="phone" size={20} />
              {booking.call}
            </a>
          </Button>
        ) : null}
      </div>
      <ul className="contact__links">
        <li>
          <a className="contact__link shell-link" href={`mailto:${HOST_CONTACT.email}`}>
            <Icon name="mail" size={20} />
            {HOST_CONTACT.email}
          </a>
        </li>
        <li>
          <a className="contact__link shell-link" href={HOST_CONTACT.instagram} target="_blank" rel="noopener noreferrer">
            <Icon name="camera" size={20} />
            {t.shell.instagram}{' '}
            <span className="sr-only">{booking.opensInNewTab}</span>
          </a>
        </li>
      </ul>
    </Section>
  );
}
