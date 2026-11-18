import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';

import { generateMetadata as homeMetadata } from '@/app/[locale]/page';
import LocaleLayout, { generateMetadata as localeLayoutMetadata } from '@/app/[locale]/layout';
import { normalizeLocale } from '@/i18n/config';
import { generateMetadata as apartmentMetadata } from '@/app/[locale]/apartment/page';
import { generateMetadata as availabilityMetadata } from '@/app/[locale]/availability/page';
import { generateMetadata as checkInMetadata } from '@/app/[locale]/check-in/page';
import { generateMetadata as categoryMetadata } from '@/app/[locale]/[category]/page';
import { generateMetadata as itemMetadata } from '@/app/[locale]/[category]/[slug]/page';
import { generateMetadata as favouritesMetadata } from '@/app/[locale]/favorites/page';
import { generateMetadata as privacyMetadata } from '@/app/[locale]/privacy/page';
import { generateMetadata as portalRefreshMetadata } from '@/app/[locale]/portal/refresh/page';
import { generateMetadata as guestMetadata } from '@/app/[locale]/guest/page';
import { generateMetadata as localeOfflineMetadata } from '@/app/[locale]/offline/page';
import { metadata as offlineMetadata } from '@/app/offline/page';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
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
  const item = getItemsByCategory(categoryId).find((candidate) => Boolean(candidate.heroImage) === withPhoto);
  if (!item) throw new Error(`no ${categoryId} item ${withPhoto ? 'with' : 'without'} a photo`);
  return { slug: item.slug ?? toSlug(item.name), image: item.heroImage };
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
    ['guest', () => guestMetadata({ params: Promise.resolve({ locale: 'en' }) })],
    ['localized offline', () => localeOfflineMetadata({ params: Promise.resolve({ locale: 'en' }) })],
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

describe('check-in page metadata', () => {
  it.each([
    ['el', 'Πληροφορίες άφιξης'],
    ['en', 'Check-in information'],
    ['xx', 'Check-in information'],
  ])('uses the %s title and stays out of search indexes', async (locale, title) => {
    const metadata = await checkInMetadata({ params: Promise.resolve({ locale }) });

    expect(metadata).toEqual({ robots: { index: false, follow: false }, title });
  });
});

describe('locale layout metadata', () => {
  it('leaves the description, canonical, og:url and title unset for pages without their own', async () => {
    const metadata = await localeLayoutMetadata({ params: Promise.resolve({ locale: 'el' }) });

    // Noindex pages (/stay, /guest, …) and 404s used to inherit the home page canonical.
    expect(metadata.description).toBeUndefined();
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).not.toHaveProperty('url');
    expect(metadata.openGraph).toMatchObject({ images: [expect.objectContaining({ url: `${siteUrl}/og/og-el.jpg` })] });
    expect(metadata.twitter).toEqual({ card: 'summary_large_image' });

    // A string title here resolves to { template: null } in Next's metadata
    // resolution and would clear the root "%s | Dolce Far Niente · Kalamata"
    // template for every page under /[locale].
    expect(metadata.title).toBeUndefined();
  });
});

describe('sitemap and robots.txt', () => {
  const NON_INDEXABLE = ['/admin', '/api', '/offline'].concat(
    ['stay', 'guest', 'check-in', 'portal', 'offline', 'favorites'].flatMap((section) => [`/en/${section}`, `/el/${section}`]),
  );

  it('lists public pages including privacy and omits non-indexable paths or lastModified', () => {
    const entries = sitemap();
    const urls = entries.map(({ url }) => url);
    expect(urls).toContain(`${siteUrl}/en/privacy`);
    expect(urls).toContain(`${siteUrl}/el/privacy`);

    for (const entry of entries) {
      const path = entry.url.slice(siteUrl.length);
      expect(NON_INDEXABLE.filter((prefix) => path === prefix || path.startsWith(`${prefix}/`)), path).toEqual([]);
      expect(entry).not.toHaveProperty('lastModified');
    }
  });

  it('disallows every non-indexable route in robots.txt and points to sitemap', () => {
    expect(robots()).toEqual({
      sitemap: `${siteUrl}/sitemap.xml`,
      rules: [{ userAgent: '*', allow: '/', disallow: NON_INDEXABLE }],
    });
  });
});

describe('locale layout guard and normalizeLocale', () => {
  const NOT_FOUND_DIGEST = /^NEXT_HTTP_ERROR_FALLBACK;404$/;
  const renderLayout = (locale: string) => LocaleLayout({ children: null, params: Promise.resolve({ locale }) });

  it.each(['x.y', '_nextfoo', 'admin'])('answers 404 for unsupported locale segment %j', async (locale) => {
    await expect(renderLayout(locale)).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND_DIGEST) });
  });

  it('renders the layout for supported locale en and normalizes locale inputs', async () => {
    const tree = await renderLayout('en');
    expect(tree.props).toMatchObject({ 'data-locale': 'en', lang: 'en' });

    expect(normalizeLocale('el')).toBe('el');
    expect(normalizeLocale('EL')).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
    expect(normalizeLocale('../el')).toBe('en');
  });
});
