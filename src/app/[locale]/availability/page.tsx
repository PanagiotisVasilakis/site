import type { Metadata } from 'next';
import Link from 'next/link';

import AvailabilityPlanner from '@/components/availability/AvailabilityPlanner';
import BookingOptions from '@/components/availability/BookingOptions';
import NightsList from '@/components/availability/NightsList';
import { describeMonths, fill } from '@/components/availability/format';
import { Icon } from '@/components/icons/Icon';
import { Callout } from '@/components/ui/Callout';
import { Section } from '@/components/ui/Section';
import { AIRBNB_LISTING_URL, HOST_CONTACT } from '@/data/contact';
import { CLIMATE_FEE_SCHEDULE, PROPERTY_TIME_ZONE } from '@/data/stayPolicy';
import { normalizeLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { propertyToday } from '@/lib/availability/calendarDate';
import { formatCentsShort } from '@/lib/availability/money';
import { climateFeeRuleOn } from '@/lib/availability/stayQuote';
import { isAirbnbListingUrl, telHref } from '@/lib/contactLinks';
import { logger } from '@/lib/logger-enterprise';
import {
  readPublicAvailability,
  type AvailabilityStatus,
  type PublicAvailability,
} from '@/lib/prisma-repositories/availabilityRepository';
import { localizedAlternates, localizedOpenGraph } from '@/lib/seo';

// Free nights and prices: the booking entry point (the old /book and
// /booking-details paths redirect here in src/proxy.ts). Rendered per request.
export const dynamic = 'force-dynamic';

type AvailabilityPageProps = { params: Promise<{ locale: string }> };

const DATE_TIME_LOCALES: Record<Locale, string> = { en: 'en-GB', el: 'el-GR' };

export async function generateMetadata({ params }: AvailabilityPageProps): Promise<Metadata> {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const dictionary = getDictionary(eff);
  const t = dictionary.availability;
  return {
    title: t.title,
    description: t.metaDescription,
    alternates: localizedAlternates(eff, '/availability'),
    openGraph: localizedOpenGraph(eff, '/availability'),
  };
}

function StatusNotice({ status, lastSyncedAt, calendarShown, locale }: {
  status: AvailabilityStatus;
  lastSyncedAt: string | null;
  calendarShown: boolean;
  locale: Locale;
}) {
  const t = getDictionary(locale).availability.status;
  const time = lastSyncedAt === null
    ? null
    : new Intl.DateTimeFormat(DATE_TIME_LOCALES[locale], { dateStyle: 'medium', timeStyle: 'short', timeZone: PROPERTY_TIME_ZONE })
      .format(new Date(lastSyncedAt));
  // identity.md §9.3: a replaced calendar gets an info Callout (no prices are
  // shown, so no text may say that they apply); a stale calendar a warning.
  let notice: { variant: 'info' | 'warning'; text: string } | null = null;
  if (!calendarShown) {
    notice = { variant: 'info', text: status === 'not_configured' ? t.notConfigured : t.unavailable };
  } else if (status === 'stale') {
    notice = { variant: 'warning', text: t.stale };
  }
  return (
    <>
      {notice === null ? null : (
        <Callout variant={notice.variant} role="status">
          <p className="ui-callout__text">{notice.text}</p>
        </Callout>
      )}
      {time === null ? null : <p className="avail-page__updated">{fill(t.lastUpdated, { time })}</p>}
    </>
  );
}

/**
 * The calendar is shown only for a synced calendar (fresh or stale, §9.3) that
 * has something to show: a price or a known free or booked night. When the
 * calendar is not configured or unavailable it is replaced by the contact options.
 */
function calendarShown(availability: PublicAvailability): boolean {
  if (availability.status !== 'fresh' && availability.status !== 'stale') return false;
  return availability.rates.length > 0 || /[ob]/.test(availability.nights);
}

export default async function AvailabilityPage({ params }: AvailabilityPageProps) {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff).availability;
  const now = new Date();

  let availability: PublicAvailability | null = null;
  try {
    availability = await readPublicAvailability(now);
  } catch {
    // No details: the error may carry connection data. The page still offers the contact options.
    logger.error('Public availability could not be read');
  }

  const feeRule = climateFeeRuleOn(availability?.today ?? propertyToday(PROPERTY_TIME_ZONE, now), CLIMATE_FEE_SCHEDULE);
  const lowSeasonMonths = feeRule
    ? Array.from({ length: 12 }, (_, index) => index + 1).filter((month) => !feeRule.highSeasonMonths.includes(month))
    : [];
  const feeRates = feeRule
    ? [
      { months: describeMonths(feeRule.highSeasonMonths, eff), cents: feeRule.highCents },
      { months: describeMonths(lowSeasonMonths, eff), cents: feeRule.lowCents },
    ].filter((rate) => rate.months !== '')
    : [];
  const calendar = availability !== null && calendarShown(availability) ? availability : null;

  return (
    <div className="avail-page">
      <header className="avail-page__head">
        <Link href={`/${eff}/apartment`} className="ui-btn ui-btn--link-arrow avail-page__back">
          <Icon name="arrow-left" size={18} />
          {t.backToApartment}
        </Link>
        <h1 className="avail-page__title">{t.title}</h1>
        <p className="avail-page__lead">{t.intro}</p>
      </header>

      <section aria-labelledby="availability-planner-title" className="avail-page__planner">
        <h2 id="availability-planner-title" className="sr-only">{t.plannerTitle}</h2>
        <StatusNotice
          status={availability?.status ?? 'unavailable'}
          lastSyncedAt={availability?.lastSyncedAt ?? null}
          calendarShown={calendar !== null}
          locale={eff}
        />
        {calendar === null ? (
          <div className="avail-page__contact-card">
            <BookingOptions locale={eff} />
          </div>
        ) : (
          <>
            <AvailabilityPlanner locale={eff} availability={calendar} />
            <noscript>
              <NightsList locale={eff} availability={calendar} />
            </noscript>
          </>
        )}
      </section>

      <div className="avail-page__sections">
        <Section id="how-to-book" variant="plain" title={t.howToBookTitle}>
          <ul className="ui-section__list">
            <li>{t.howToBook[0]}</li>
            {isAirbnbListingUrl(AIRBNB_LISTING_URL) ? <li>{t.howToBookAirbnb}</li> : null}
            {t.howToBook.slice(1).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Section>

        <Section id="cancellation" variant="plain" title={t.cancellationTitle}>
          <ul className="ui-section__list">
            {t.cancellation.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Section>

        <Section id="withdrawal" variant="plain" title={t.withdrawalTitle}>
          <p>{t.withdrawal}</p>
        </Section>

        <Section id="climate-fee" variant="plain" title={t.climateFeeTitle}>
          <p>{t.climateFeeIntro}</p>
          <ul className="ui-section__list">
            {feeRates.map((rate) => (
              <li key={rate.months}>{fill(t.climateFeeRate, { months: rate.months, amount: formatCentsShort(rate.cents, eff) })}</li>
            ))}
          </ul>
          <p>{t.climateFeeSummary}</p>
        </Section>

        <Section id="prices" variant="plain" title={t.pricesTitle}>
          <ul className="ui-section__list">
            {t.prices.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Section>

        <Section id="contact" variant="plain" title={t.contactTitle}>
          <p>{t.contactIntro}</p>
          <ul className="ui-section__list ui-section__list--plain">
            <li>{t.phoneLabel}: <a className="shell-link ui-section__link" href={telHref(HOST_CONTACT.phone)}>{HOST_CONTACT.phone}</a></li>
            <li>{t.emailLabel}: <a className="shell-link ui-section__link" href={`mailto:${HOST_CONTACT.email}`}>{HOST_CONTACT.email}</a></li>
            <li>
              <a className="shell-link ui-section__link" href={HOST_CONTACT.whatsapp} target="_blank" rel="noopener noreferrer">
                {t.whatsappLabel}{' '}
                <span className="sr-only">{t.booking.opensInNewTab}</span>
              </a>
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
