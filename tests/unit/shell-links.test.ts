import { describe, expect, it } from 'vitest';

import { getDictionary } from '@/i18n/dictionaries';
import {
  STAY_HUB_PATH,
  brandHref,
  footerBrandLines,
  footerContactId,
  footerContactLinks,
  footerNavLinks,
  footerStayLink,
  footerVariantFor,
  headerCta,
  headerOverlaysHero,
  isCurrentLink,
  localeSwitchHref,
  menuContactLinks,
  navLinks,
  shellVariantFor,
} from '@/components/shell/shellLinks';

const BOOKING_HREF = /\/availability|airbnb\./i;

describe('shell variant per route (identity §8, §9)', () => {
  it.each([
    ['/en', 'marketing'],
    ['/el/apartment', 'marketing'],
    ['/en/availability', 'marketing'],
    ['/en/moments', 'guide'],
    ['/el/moments/some-beach', 'guide'],
    ['/en/favorites', 'guide'],
    ['/el/phones', 'guide'],
    ['/en/stay', 'stay'],
    ['/el/stay/', 'stay'],
    ['/en/guest', 'stay'],
    ['/el/check-in', 'stay'],
    ['/en/portal/refresh', 'stay'],
    ['/el/offline', 'stay'],
  ] as const)('%s is %s', (pathname, variant) => {
    expect(shellVariantFor(pathname)).toBe(variant);
  });

  it('uses the marketing footer for guide pages and the slim footer for stay pages', () => {
    expect(footerVariantFor('marketing')).toBe('marketing');
    expect(footerVariantFor('guide')).toBe('marketing');
    expect(footerVariantFor('stay')).toBe('stay');
  });

  it('floats the header over the hero only on home (the apartment page starts with its page head, R3-V6f)', () => {
    expect(headerOverlaysHero('/en')).toBe(true);
    expect(headerOverlaysHero('/el')).toBe(true);
    expect(headerOverlaysHero('/el/apartment')).toBe(false);
    expect(headerOverlaysHero('/en/apartment')).toBe(false);
    expect(headerOverlaysHero('/en/availability')).toBe(false);
    expect(headerOverlaysHero('/en/guest')).toBe(false);
  });
});

describe('shell links', () => {
  it.each(['en', 'el'] as const)('gives the stay variant no booking, availability or Airbnb link (%s)', (locale) => {
    const t = getDictionary(locale);
    const hrefs = [
      brandHref('stay', locale),
      ...navLinks('stay', locale, t).map((link) => link.href),
      ...menuContactLinks('stay', t).map((link) => link.href),
      ...footerNavLinks('stay', locale, t).map((link) => link.href),
      ...footerContactLinks('stay', t).map((link) => link.href),
    ];
    expect(headerCta('stay', locale, t)).toBeNull();
    expect(footerStayLink('stay', locale, t)).toBeNull();
    expect(hrefs.filter((href) => BOOKING_HREF.test(href))).toEqual([]);
    expect(navLinks('stay', locale, t).map(({ key, href }) => [key, href])).toEqual([
      ['stay', `/${locale}${STAY_HUB_PATH}`],
      ['guide', `/${locale}/moments`],
    ]);
  });

  it('routes the stay brand and "Your stay" through the one hub constant, the /stay hub (R3-V9)', () => {
    expect(STAY_HUB_PATH).toBe('/stay');
    expect(brandHref('stay', 'el')).toBe('/el/stay');
    expect(brandHref('marketing', 'el')).toBe('/el');
    expect(footerStayLink('marketing', 'en', getDictionary('en'))?.href).toBe('/en/stay');
  });

  it('gives marketing the §8 nav, the "Check dates" CTA, and Call and WhatsApp in the menu', () => {
    const t = getDictionary('en');
    expect(navLinks('marketing', 'en', t).map(({ label, href }) => [label, href])).toEqual([
      ['Apartment', '/en/apartment'],
      ['Availability', '/en/availability'],
      ['Kalamata guide', '/en/moments'],
      ['Contact', '/en#contact'],
      ['Your stay', '/en/stay'],
    ]);
    expect(headerCta('marketing', 'en', t)).toEqual({ key: 'check-dates', href: '/en/availability', label: 'Check dates' });
    expect(menuContactLinks('marketing', t).map(({ key, href }) => [key, href])).toEqual([
      ['call', 'tel:+306955810051'],
      ['whatsapp', 'https://wa.me/306955810051'],
    ]);
  });

  it.each([
    ['en', 'Your stay'],
    ['el', 'Η διαμονή σας'],
  ] as const)('ends the marketing and guide nav with "Your stay" and lists it once in the footer (%s)', (locale, label) => {
    const t = getDictionary(locale);
    const stay = { key: 'stay', href: `/${locale}${STAY_HUB_PATH}`, label: t.ui.yourStay };
    expect(stay.label).toBe(label);
    expect(navLinks('marketing', locale, t).at(-1)).toEqual(stay);
    expect(navLinks('guide', locale, t).at(-1)).toEqual(stay);
    // The footer shows "Your stay" on its own (footerStayLink): the nav list must not repeat it.
    expect(footerNavLinks('marketing', locale, t).map(({ key }) => key)).not.toContain('stay');
    expect(footerStayLink('marketing', locale, t)).toEqual({
      key: 'your-stay', href: `/${locale}${STAY_HUB_PATH}`, label: t.shell.footerStay,
    });
    const footerHubLinks = [...footerNavLinks('marketing', locale, t), footerStayLink('marketing', locale, t)]
      .filter((link) => link?.href === `/${locale}${STAY_HUB_PATH}`);
    expect(footerHubLinks).toHaveLength(1);
  });

  it('gives guide pages the same nav without a CTA or menu contact rows', () => {
    const t = getDictionary('el');
    expect(navLinks('guide', 'el', t)).toEqual(navLinks('marketing', 'el', t));
    expect(headerCta('guide', 'el', t)).toBeNull();
    expect(menuContactLinks('guide', t)).toEqual([]);
  });

  it('lists phone, e-mail, Instagram and WhatsApp in the marketing footer', () => {
    expect(footerContactLinks('marketing', getDictionary('en')).map(({ key }) => key)).toEqual([
      'phone', 'email', 'instagram', 'whatsapp',
    ]);
  });

  it('gives the marketing footer the hero tagline and location line under the brand, and the slim stay footer none', () => {
    for (const locale of ['en', 'el'] as const) {
      const t = getDictionary(locale);
      expect(footerBrandLines('marketing', t)).toEqual({ tagline: t.home.heroTagline, place: t.home.heroFacts });
      expect(footerBrandLines('stay', t)).toBeNull();
    }
    expect(footerBrandLines('marketing', getDictionary('en'))?.tagline).toBe('Slow days on a sunlit balcony in Kalamata.');
  });

  it('puts the target of every "Contact" link in the footer of the home page only', () => {
    const contact = navLinks('marketing', 'en', getDictionary('en')).find((link) => link.key === 'contact');
    expect(contact?.href).toBe(`/en#${footerContactId('/en')}`);
    expect(footerContactId('/el')).toBe('contact');
    expect(footerContactId('/el/')).toBe('contact');
    for (const pathname of ['/en/availability', '/el/apartment', '/en/moments', '/en/privacy', '/en/guest', '/el/stay']) {
      expect(footerContactId(pathname), pathname).toBeUndefined();
    }
  });

  it('marks the current page by path, never a hash link', () => {
    expect(isCurrentLink('/en/apartment', '/en/apartment')).toBe(true);
    expect(isCurrentLink('/en/moments/some-beach', '/en/moments')).toBe(true);
    expect(isCurrentLink('/en/momentsx', '/en/moments')).toBe(false);
    expect(isCurrentLink('/en', '/en#contact')).toBe(false);
    expect(isCurrentLink('/en', 'tel:+30')).toBe(false);
  });
});

describe('localeSwitchHref', () => {
  it('swaps the locale and keeps the query and the hash', () => {
    expect(localeSwitchHref('/en/apartment', 'el', '?m=2026-10', '#living')).toBe('/el/apartment?m=2026-10#living');
    expect(localeSwitchHref('/el', 'en', 'mode=signin', 'x')).toBe('/en?mode=signin#x');
    expect(localeSwitchHref('/el/moments', 'en')).toBe('/en/moments');
  });

  it('drops the legacy claim query names the guest client scrubs from history', () => {
    expect(localeSwitchHref('/en/guest', 'el', 'claim=x&a=1')).toBe('/el/guest?a=1');
    expect(localeSwitchHref('/en/guest', 'el', '?claimToken=y&claim=x', '#top')).toBe('/el/guest#top');
  });

  it('adds a locale to a path without one', () => {
    expect(localeSwitchHref('/', 'el')).toBe('/el');
    expect(localeSwitchHref('/offline', 'en', '', '')).toBe('/en/offline');
  });
});
