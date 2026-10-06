import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';

import { generateMetadata as homeMetadata } from '@/app/[locale]/page';
import { generateMetadata as apartmentMetadata } from '@/app/[locale]/apartment/page';
import { generateMetadata as availabilityMetadata } from '@/app/[locale]/availability/page';
import { generateMetadata as categoryMetadata } from '@/app/[locale]/[category]/page';
import { generateMetadata as itemMetadata } from '@/app/[locale]/[category]/[slug]/page';
import { generateMetadata as favouritesMetadata } from '@/app/[locale]/favorites/page';
import { generateMetadata as privacyMetadata } from '@/app/[locale]/privacy/page';
import { generateMetadata as portalRefreshMetadata } from '@/app/[locale]/portal/refresh/page';
import { metadata as guestMetadata } from '@/app/[locale]/guest/layout';
import { metadata as localeOfflineMetadata } from '@/app/[locale]/offline/page';
import { metadata as offlineMetadata } from '@/app/offline/page';
import { metadata as adminMetadata } from '@/app/admin/page';
import { metadata as adminAvailabilityMetadata } from '@/app/admin/availability/page';
import { metadata as adminGuestsMetadata } from '@/app/admin/guests/layout';
import { metadata as adminLoginMetadata } from '@/app/admin/login/page';
import { metadata as adminRequestsMetadata } from '@/app/admin/requests/page';
import { metadata as adminSettingsMetadata } from '@/app/admin/settings/page';
import { getItemsByCategory, toSlug } from '@/lib/data';
import { serializeJsonLd } from '@/lib/jsonLd';
import { organizationJsonLd } from '@/lib/seo';
import { siteUrl } from '@/lib/site';

type Load = (locale: string) => Promise<Metadata>;

function detailItem(categoryId: string, withPhoto: boolean): { slug: string; image: string | undefined } {
  const item = getItemsByCategory(categoryId).find((candidate) => Boolean(candidate.heroImage ?? candidate.image) === withPhoto);
  if (!item) throw new Error(`no ${categoryId} item ${withPhoto ? 'with' : 'without'} a photo`);
  return { slug: item.slug ?? toSlug(item.name), image: item.heroImage ?? item.image };
}

const moment = detailItem('moments', true);
const momentSlug = moment.slug;
const phoneSlug = detailItem('phones', false).slug;

/** Every public localized page and its path after the locale (identity §12 R3-V11). */
const PUBLIC_PAGES: ReadonlyArray<readonly [string, string, Load]> = [
  ['home', '', (locale) => homeMetadata({ params: Promise.resolve({ locale }) })],
  ['apartment', '/apartment', (locale) => apartmentMetadata({ params: Promise.resolve({ locale }) })],
  ['availability', '/availability', (locale) => availabilityMetadata({ params: Promise.resolve({ locale }) })],
  ['guide list', '/moments', (locale) => categoryMetadata({ params: Promise.resolve({ locale, category: 'moments' }) })],
  ['phones', '/phones', (locale) => categoryMetadata({ params: Promise.resolve({ locale, category: 'phones' }) })],
  ['guide detail', `/moments/${momentSlug}`, (locale) => itemMetadata({ params: Promise.resolve({ locale, category: 'moments', slug: momentSlug }) })],
  ['phones detail without a photo', `/phones/${phoneSlug}`, (locale) => itemMetadata({ params: Promise.resolve({ locale, category: 'phones', slug: phoneSlug }) })],
  ['favourites', '/favorites', (locale) => favouritesMetadata({ params: Promise.resolve({ locale }) })],
  ['privacy', '/privacy', (locale) => privacyMetadata({ params: Promise.resolve({ locale }) })],
];

const NOT_INDEXED = { index: false, follow: false };

describe('public page metadata (identity §12 R3-V11)', () => {
  it.each(PUBLIC_PAGES)('%s: description, canonical, hreflang en/el + x-default and an absolute share image', async (name, path, load) => {
    for (const locale of ['en', 'el']) {
      const metadata = await load(locale);

      expect(metadata.description, `${name} ${locale}`).toEqual(expect.stringMatching(/\S/));
      expect(metadata.alternates).toEqual({
        canonical: `/${locale}${path}`,
        languages: { en: `/en${path}`, el: `/el${path}`, 'x-default': `/en${path}` },
      });
      // Next replaces openGraph as a whole per segment: a page that sets it must carry the image too.
      expect(metadata.openGraph).toMatchObject({ url: `/${locale}${path}`, siteName: 'Dolce Far Niente · Kalamata' });
      // A detail page with its own photo shares that photo; every other page shares the locale card.
      expect(metadata.openGraph?.images).toEqual(
        name === 'guide detail'
          ? [expect.objectContaining({ url: `${siteUrl}${moment.image}` })]
          : [expect.objectContaining({ url: `${siteUrl}/og/og-${locale}.jpg`, width: 1200, height: 630 })],
      );
      // Favourites live on the visitor's device: nothing to index.
      expect(metadata.robots).toEqual(name === 'favourites' ? NOT_INDEXED : undefined);
    }
  });

  it.each([
    ['portal refresh', () => portalRefreshMetadata({ params: Promise.resolve({ locale: 'en' }) })],
    ['guest', async () => guestMetadata],
    ['localized offline', async () => localeOfflineMetadata],
    ['offline', async () => offlineMetadata],
  ] as const)('%s is not indexed', async (_name, load) => {
    expect((await load()).robots).toEqual(NOT_INDEXED);
  });

  it('every admin page is not indexed', () => {
    for (const metadata of [adminMetadata, adminAvailabilityMetadata, adminGuestsMetadata, adminLoginMetadata, adminRequestsMetadata, adminSettingsMetadata]) {
      expect(metadata.robots).toBe('noindex, nofollow');
    }
  });
});

describe('Organization JSON-LD', () => {
  it('parses as JSON and claims only what the data backs: no VacationRental (plan §3)', () => {
    const json = serializeJsonLd(organizationJsonLd());

    expect(json).not.toContain('VacationRental');
    expect(JSON.parse(json)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Dolce Far Niente · Kalamata',
      url: siteUrl,
      logo: `${siteUrl}/icons/icon-512.png`,
      sameAs: ['https://www.instagram.com/dolcefarniente_kalamata'],
      email: 'dolcefarnienteapartments@gmail.com',
      telephone: '+30 695 581 0051',
    });
  });
});
