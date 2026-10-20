import { describe, expect, it, vi } from 'vitest';

import { getDictionary } from '@/i18n/dictionaries';
import {
  STAY_HUB_PATH,
  brandHref,
  footerBrandLines,
  footerContactId,
  footerContactLinks,
  footerNavLinks,
  footerStayLink,
  headerCta,
  headerOverlaysHero,
  isCurrentLink,
  localeSwitchHref,
  menuContactLinks,
  navLinks,
  scrollToCurrentHash,
  shellVariantFor,
} from '@/components/shell/shellLinks';

const BOOKING_HREF = /\/availability|booking\.com/i;

describe('shell variant per route (identity §8, §9)', () => {
  it.each([
    ['/en', 'marketing'],
    ['/el/apartment', 'marketing'],
    ['/en/availability', 'marketing'],
    ['/en/moments', 'guide'],
    ['/el/moments/some-beach', 'guide'],
    ['/en/stay', 'stay'],
    ['/el/stay/', 'stay'],
    ['/en/guest', 'stay'],
    ['/el/check-in', 'stay'],
    ['/en/portal/refresh', 'stay'],
    ['/el/offline', 'stay'],
  ] as const)('%s is %s', (pathname, variant) => {
    expect(shellVariantFor(pathname)).toBe(variant);
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
  it.each(['en'] as const)('gives the stay variant no booking, availability or Booking.com link (%s)', (locale) => {
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

  it.each([
    ['en', 'Your stay'],
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

describe('scrollToCurrentHash (R-689)', () => {
  const click = (init: Partial<Parameters<typeof scrollToCurrentHash>[0]> = {}) => ({
    button: 0,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...init,
  });

  /** A page at `pathname` + `hash` whose only element with an id is `ids`. */
  function stubPage(pathname: string, hash: string, ids: Record<string, { scrollIntoView: () => void }> = {}) {
    vi.stubGlobal('window', { location: { pathname, hash, search: '' } });
    vi.stubGlobal('document', { getElementById: (id: string) => ids[id] ?? null });
  }

  it('prevents the default and scrolls to the target when the URL already is the link', () => {
    const target = { scrollIntoView: vi.fn() };
    stubPage('/en', '#contact', { contact: target });
    const event = click();
    scrollToCurrentHash(event, '/en#contact');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    // No options: the page's CSS decides how it scrolls (there is no smooth scrolling, so reduced motion stays instant).
    expect(target.scrollIntoView).toHaveBeenCalledWith();
  });

  it('does the same for the Greek home page', () => {
    const target = { scrollIntoView: vi.fn() };
    stubPage('/el', '#contact', { contact: target });
    const event = click();
    scrollToCurrentHash(event, '/el#contact');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the first click: the URL has no hash yet', '/en', ''],
    ['another hash', '/en', '#host'],
    ['another page', '/en/apartment', '#contact'],
  ])('leaves the click to the router: %s', (_name, pathname, hash) => {
    const target = { scrollIntoView: vi.fn() };
    stubPage(pathname, hash, { contact: target });
    const event = click();
    scrollToCurrentHash(event, '/en#contact');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it.each([
    ['a link without a hash', '/en/apartment'],
    ['a link with an empty hash', '/en#'],
  ])('ignores %s', (_name, href) => {
    const target = { scrollIntoView: vi.fn() };
    stubPage('/en/apartment', '', { contact: target });
    const event = click();
    scrollToCurrentHash(event, href);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['the middle button', { button: 1 }],
    ['an event another handler already prevented', { defaultPrevented: true }],
  ])('leaves a click with %s to the browser', (_name, init) => {
    const target = { scrollIntoView: vi.fn() };
    stubPage('/en', '#contact', { contact: target });
    const event = click(init);
    scrollToCurrentHash(event, '/en#contact');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it('prevents nothing when the page has no element with that id', () => {
    stubPage('/en', '#contact');
    const event = click();
    scrollToCurrentHash(event, '/en#contact');
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
