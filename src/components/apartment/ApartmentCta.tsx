import Link from 'next/link';

import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { AIRBNB_LISTING_URL } from '@/data/contact';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { airbnbListingHref, isAirbnbListingUrl } from '@/lib/contactLinks';

/**
 * identity §9.2 CTA: "See free dates" (primary), "Book on Airbnb" (secondary, only with a valid listing
 * URL, §1.4) and the contact link to the home contact section (plan V6).
 */
export default function ApartmentCta({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const cta = t.house.cta;

  return (
    <Section id="book" eyebrow={cta.eyebrow} title={cta.title} lead={cta.lead} className="apt-cta">
      <div className="apt-cta__actions" data-cta-watch>
        <Button asChild variant="primary">
          <Link href={`/${locale}/availability`}>
            {cta.seeDates}
            <Icon name="arrow-right" size={20} />
          </Link>
        </Button>
        {isAirbnbListingUrl(AIRBNB_LISTING_URL) ? (
          <Button asChild variant="secondary">
            <a href={airbnbListingHref(AIRBNB_LISTING_URL)} target="_blank" rel="noopener noreferrer">
              {t.availability.booking.airbnb}
              <Icon name="arrow-up-right" size={20} />{' '}
              <span className="sr-only">{t.availability.booking.opensInNewTab}</span>
            </a>
          </Button>
        ) : null}
      </div>
      <p className="apt-cta__contact">
        <Button asChild variant="link-arrow">
          <Link href={`/${locale}#contact`}>
            {cta.contact}
            <Icon name="arrow-right" size={20} />
          </Link>
        </Button>
      </p>
    </Section>
  );
}
