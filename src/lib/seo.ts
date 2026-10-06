import type { Metadata } from 'next';

import { BRAND_NAME } from '@/data/brand';
import { HOST_CONTACT } from '@/data/contact';
import { locales, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { absUrl, siteUrl } from '@/lib/site';

type OpenGraph = NonNullable<Metadata['openGraph']>;

const OPEN_GRAPH_LOCALES: Record<Locale, string> = { en: 'en_US', el: 'el_GR' };

export function localizedAlternates(locale: Locale, suffix = ''): NonNullable<Metadata['alternates']> {
  const normalizedSuffix = suffix && !suffix.startsWith('/') ? `/${suffix}` : suffix;
  return {
    canonical: `/${locale}${normalizedSuffix}`,
    languages: {
      en: `/en${normalizedSuffix}`,
      el: `/el${normalizedSuffix}`,
      'x-default': `/en${normalizedSuffix}`,
    },
  };
}

/**
 * Open Graph fields of a localized page with the locale's share card (public/og/og-<locale>.jpg,
 * 1200 × 630, scripts/design/gen-og-images.ts) unless `images` overrides it. Next replaces
 * `openGraph` as a whole per segment, so every page that sets it goes through here. No title or
 * description: Next fills them from the page's own (the title carries the brand template), and
 * twitter takes all three from here. `suffix` (the path after the locale) sets og:url; the locale
 * layout passes none, so pages without their own openGraph never claim another page's URL.
 */
export function localizedOpenGraph(locale: Locale, suffix?: string, images?: OpenGraph['images']): OpenGraph {
  return {
    type: 'website',
    siteName: BRAND_NAME,
    locale: OPEN_GRAPH_LOCALES[locale],
    alternateLocale: locales.filter((other) => other !== locale).map((other) => OPEN_GRAPH_LOCALES[other]),
    ...(suffix === undefined ? {} : { url: `/${locale}${suffix}` }),
    images: images ?? [{
      url: absUrl(`/og/og-${locale}.jpg`),
      width: 1200,
      height: 630,
      type: 'image/jpeg',
      alt: getDictionary(locale).home.heroAlt,
    }],
  };
}

/**
 * The brand's schema.org Organization (identity §12 R3-V11): only facts the data backs. Not a
 * VacationRental or LodgingBusiness (plan §3): no address, rating, amenities or prices.
 */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND_NAME,
    url: siteUrl,
    logo: absUrl('/icons/icon-512.png'),
    sameAs: [HOST_CONTACT.instagram],
    email: HOST_CONTACT.email,
    telephone: HOST_CONTACT.phone,
  };
}
