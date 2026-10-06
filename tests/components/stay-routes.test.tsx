// @vitest-environment jsdom

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ locale: 'en', search: '' }));
const flags = vi.hoisted(() => ({ portalEnabled: true, checkinEnabled: true }));
const session = vi.hoisted(() => ({ isSignedIn: false }));
const fetchMock = vi.hoisted(() => vi.fn());
const preferences = vi.hoisted(() => ({ checkOutTime: '11:00' }));
// When set, the phones list puts its non-emergency numbers right after 112 (R3-L10 stay hub filter).
const phonesOrder = vi.hoisted(() => ({ nonEmergencyFirst: false }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  usePathname: () => `/${navigation.locale}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
  redirect: (target: string) => { throw new Error(`NEXT_REDIRECT ${target}`); },
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/dynamic', () => ({ default: () => function MapStub() { return null; } }));
vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: async () => ({ ...flags }) }));
vi.mock('@/hooks/useGuestSession', () => ({ useGuestSession: () => ({ isSignedIn: session.isSignedIn, signOut: vi.fn() }) }));
vi.mock('@/lib/guestSession', () => ({
  GUEST_REFRESH_COOKIE: 'guest_refresh',
  getVerifiedGuestSessionFromCookies: async () => (session.isSignedIn ? { sessionId: 's1', bookingId: 'b1' } : null),
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return {
    ...actual,
    getItemsByCategory: (categoryId: string) => {
      const items = actual.getItemsByCategory(categoryId);
      if (categoryId !== 'phones' || !phonesOrder.nonEmergencyFirst) return items;
      const isEmergency = (item: (typeof items)[number]) => item.tags?.includes('emergency') ?? false;
      return [items[0], ...items.filter((item) => !isEmergency(item)), ...items.slice(1).filter(isEmergency)];
    },
  };
});

import StayPage from '@/app/[locale]/stay/page';
import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';
import CheckInPage from '@/app/[locale]/check-in/page';
import OfflineLocalePage from '@/app/[locale]/offline/page';
import OfflinePage from '@/app/offline/page';
import { ToastProvider } from '@/components/Toast';
import { favoriteIdOf } from '@/components/guide/guideEntries';
import { categories } from '@/data/categories';
import { getDictionary } from '@/i18n/dictionaries';
import { telHref } from '@/lib/contactLinks';
import { getItemsByCategory, pickLocale } from '@/lib/data';

const wrap = (node: ReactNode) => render(<ToastProvider>{node}</ToastProvider>);
const params = (locale: string) => ({ params: Promise.resolve({ locale }) });

// Every stylesheet under src/styles (literal paths; the listing test below keeps the list complete).
const STYLESHEETS: Array<[file: string, css: string]> = [
  ['base.css', readFileSync('src/styles/base.css', 'utf8')],
  ['motion.css', readFileSync('src/styles/motion.css', 'utf8')],
  ['tokens.css', readFileSync('src/styles/tokens.css', 'utf8')],
  ['components/admin.css', readFileSync('src/styles/components/admin.css', 'utf8')],
  ['components/apartment.css', readFileSync('src/styles/components/apartment.css', 'utf8')],
  ['components/calendar.css', readFileSync('src/styles/components/calendar.css', 'utf8')],
  ['components/guide.css', readFileSync('src/styles/components/guide.css', 'utf8')],
  ['components/hero.css', readFileSync('src/styles/components/hero.css', 'utf8')],
  ['components/home.css', readFileSync('src/styles/components/home.css', 'utf8')],
  ['components/legal.css', readFileSync('src/styles/components/legal.css', 'utf8')],
  ['components/lightbox.css', readFileSync('src/styles/components/lightbox.css', 'utf8')],
  ['components/map.css', readFileSync('src/styles/components/map.css', 'utf8')],
  ['components/shell.css', readFileSync('src/styles/components/shell.css', 'utf8')],
  ['components/stay.css', readFileSync('src/styles/components/stay.css', 'utf8')],
  ['components/ui.css', readFileSync('src/styles/components/ui.css', 'utf8')],
];

/** Every class named in a scroll-driven rule: inside `@supports (animation-timeline …)` or next to an `animation-timeline` declaration. */
function scrollDrivenClasses(): Set<string> {
  const classes = new Set<string>();
  const collect = (prelude: string) => {
    for (const match of prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/gu)) classes.add(match[1]);
  };
  for (const [, source] of STYLESHEETS) {
    const css = source.replace(/\/\*[\s\S]*?\*\//gu, '');
    for (let at = css.indexOf('@supports (animation-timeline'); at >= 0; at = css.indexOf('@supports (animation-timeline', at + 1)) {
      let depth = 0;
      let end = css.indexOf('{', at);
      for (; end < css.length; end += 1) {
        if (css[end] === '{') depth += 1;
        if (css[end] === '}' && --depth === 0) break;
      }
      for (const prelude of css.slice(css.indexOf('{', at) + 1, end).matchAll(/([^{};]+)\{/gu)) collect(prelude[1]);
    }
    for (const rule of css.matchAll(/([^{};]+)\{[^{}]*animation-timeline\s*:/gu)) collect(rule[1]);
  }
  return classes;
}

const SCROLL_DRIVEN = scrollDrivenClasses();

/** §9.4/§12 R3-V9: no booking CTA or Airbnb link on a stay page, and calm mode only. */
function expectCalmStayPage(container: HTMLElement) {
  const hrefs = Array.from(container.querySelectorAll('a[href]'), (link) => link.getAttribute('href') ?? '');
  expect(hrefs.filter((href) => /airbnb\.com/iu.test(href))).toEqual([]);
  expect(hrefs.filter((href) => href.includes('/availability'))).toEqual([]);
  const used = new Set(Array.from(container.querySelectorAll('[class]'), (element) => [...element.classList]).flat());
  expect([...used].filter((name) => SCROLL_DRIVEN.has(name))).toEqual([]);
  expect(container.querySelector('canvas')).toBeNull();
}

beforeEach(() => {
  navigation.locale = 'en';
  navigation.search = '';
  flags.portalEnabled = true;
  flags.checkinEnabled = true;
  session.isSignedIn = false;
  preferences.checkOutTime = '11:00';
  phonesOrder.nonEmergencyFirst = false;
  window.localStorage.clear();
  fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify({
    success: true,
    data: url === '/api/check-in/preferences'
      ? { checkInTime: '15:00', checkOutTime: preferences.checkOutTime, canEdit: false, wifi: { network: 'Guest-Net', password: 'p4ss-w0rd' } }
      : { request: null },
  }), { status: 200 }));
});

describe('the scroll-driven class list used by the calm-mode assertions', () => {
  it('reads every stylesheet', () => {
    const listed = readdirSync('src/styles', { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.css'))
      .map((file) => file.split(path.sep).join('/'))
      .sort();
    expect(STYLESHEETS.map(([file]) => file).sort()).toEqual(listed);
  });

  it('is parsed from the stylesheets (sanity check)', () => {
    expect(SCROLL_DRIVEN.has('hero')).toBe(true);
    expect(SCROLL_DRIVEN.has('kinetic')).toBe(true);
  });

  it('has no scroll-driven or animated rule in the stay stylesheet', () => {
    const stay = STYLESHEETS.find(([file]) => file === 'components/stay.css')![1];
    expect(stay).not.toMatch(/animation|view-timeline|scroll-timeline|@keyframes|transition/u);
  });
});

describe('/{l}/stay hub (identity §9.4)', () => {
  it('welcomes the guest and offers the portal sign-in, locked Wi-Fi and check-out, phones, guide and favourites', async () => {
    // Two current places and one id left behind by removed content: only the two that resolve count.
    const known = categories.flatMap((c) => getItemsByCategory(c.id).map((item) => favoriteIdOf(c, item))).slice(0, 2);
    expect(known).toHaveLength(2);
    window.localStorage.setItem('favorites:v1', JSON.stringify([...known, 'moments:removed-place']));
    const { container } = wrap(await StayPage(params('en')));

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome home.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign in to your stay/u })).toHaveAttribute('href', '/en/guest');
    for (const name of ['Wi-Fi', 'Check-out']) {
      const tile = screen.getByRole('heading', { name }).closest('.stay-tile') as HTMLElement;
      expect(tile).toHaveClass('stay-tile--locked');
      expect(tile).toHaveTextContent('Sign in to see');
      expect(within(tile).queryByRole('link')).toBeNull();
    }
    expect(screen.getByRole('link', { name: /112/u })).toHaveAttribute('href', 'tel:112');
    const phones = screen.getByRole('heading', { name: 'Important phones' }).closest('.stay-tile') as HTMLElement;
    const calls = within(phones).getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('tel:'));
    expect(calls).toHaveLength(3);
    // After the 112 row, the first two numbers of the emergency list (R3-L10).
    expect(calls.map((link) => link.getAttribute('href'))).toEqual(['tel:112', 'tel:166', 'tel:199']);
    const search = screen.getByRole('searchbox');
    expect(search).toHaveAttribute('name', 'q');
    expect(search.closest('form')).toHaveAttribute('action', '/en/moments');
    expect(search.closest('form')).toHaveAttribute('method', 'get');
    const favourites = screen.getByRole('link', { name: /Favourites/u });
    expect(favourites).toHaveAttribute('href', '/en/favorites');
    expect(await within(favourites).findByText('2')).toBeInTheDocument();
    expectCalmStayPage(container);
  });

  it('lists only emergency numbers in the phones tile, even when other numbers come first (R3-L10)', async () => {
    phonesOrder.nonEmergencyFirst = true;
    const others = getItemsByCategory('phones').filter((item) => !item.tags?.includes('emergency') && item.phone);
    // Sanity check: the reordered list really puts non-emergency numbers right after 112.
    expect(others.length).toBeGreaterThanOrEqual(2);
    expect(getItemsByCategory('phones').slice(1, 3).map((item) => item.id)).toEqual(others.slice(0, 2).map((item) => item.id));
    wrap(await StayPage(params('en')));

    const phones = screen.getByRole('heading', { name: 'Important phones' }).closest('.stay-tile') as HTMLElement;
    const hrefs = within(phones).getAllByRole('link').map((link) => link.getAttribute('href')).filter((href) => href?.startsWith('tel:'));
    expect(hrefs).toEqual(['tel:112', 'tel:166', 'tel:199']);
    for (const item of others) expect(hrefs, item.id).not.toContain(telHref(item.phone));
  });

  it('opens the check-in and unlocks Wi-Fi and check-out once signed in', async () => {
    session.isSignedIn = true;
    const { container } = wrap(await StayPage(params('en')));

    expect(screen.getByRole('link', { name: /Open your check-in/u })).toHaveAttribute('href', '/en/check-in');
    expect(screen.getByRole('link', { name: /Wi-Fi/u })).toHaveAttribute('href', '/en/check-in#wifi');
    expect(screen.getByRole('link', { name: /Check-out/u })).toHaveAttribute('href', '/en/check-in#check-out');
    expect(screen.getByRole('link', { name: /House rules/u })).toHaveAttribute('href', '/en/check-in#house-rules');
    expect(container.querySelector('.stay-tile--locked')).toBeNull();
    expectCalmStayPage(container);
  });

  it('offers no check-in link to a signed-in guest while check-in is off (the check-in page would 404)', async () => {
    session.isSignedIn = true;
    flags.checkinEnabled = false;
    const { container } = wrap(await StayPage(params('en')));

    expect(container.querySelector('a[href^="/en/check-in"]')).toBeNull();
    expect(container.querySelector('.stay-tile--portal, .stay-tile--locked')).toBeNull();
    expect(screen.queryByRole('link', { name: /Sign in to your stay/u })).toBeNull();
    expect(screen.getByRole('link', { name: /112/u })).toHaveAttribute('href', 'tel:112');
    expectCalmStayPage(container);
  });

  it('renders no portal tile and no sign-in tiles while the portal is off', async () => {
    flags.portalEnabled = false;
    flags.checkinEnabled = false;
    const { container } = wrap(await StayPage(params('el')));

    expect(screen.getByRole('heading', { level: 1, name: 'Καλώς ήρθατε.' })).toBeInTheDocument();
    expect(container.querySelector('a[href^="/el/guest"], a[href^="/el/check-in"]')).toBeNull();
    expect(container.querySelector('.stay-tile--portal, .stay-tile--locked')).toBeNull();
    expect(screen.getByRole('link', { name: /112/u })).toHaveAttribute('href', 'tel:112');
    expectCalmStayPage(container);
  });

  it('is not indexed', async () => {
    const { generateMetadata } = await import('@/app/[locale]/stay/page');
    expect((await generateMetadata(params('en'))).robots).toEqual({ index: false, follow: false });
  });
});

describe('stay routes render calm, with no booking CTA (identity §12 R3-V9)', () => {
  it.each(['en', 'el'])('guest sign-in (%s)', (locale) => {
    navigation.locale = locale;
    const { container } = wrap(<UnifiedGuestClient />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expectCalmStayPage(container);
  });

  it.each(['en', 'el'])('guest claim flow (%s)', (locale) => {
    navigation.locale = locale;
    navigation.search = 'mode=signup';
    const { container } = wrap(<UnifiedGuestClient />);
    expectCalmStayPage(container);
  });

  it.each([
    ['en', 'Please check out by 10:30.'],
    ['el', 'Παρακαλούμε αναχωρήστε έως τις 10:30.'],
  ])('check-in with a session (%s)', async (locale, checkoutSentence) => {
    session.isSignedIn = true;
    navigation.locale = locale;
    // Not CheckInInfo's default ('11:00'), so the check-out section must show the loaded preference.
    preferences.checkOutTime = '10:30';
    const { container } = wrap(await CheckInPage(params(locale)));

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect((await screen.findAllByText('Guest-Net')).length).toBeGreaterThan(0);
    for (const id of ['wifi', 'check-out', 'house-rules', 'emergency']) expect(container.querySelector(`#${id}`)).not.toBeNull();
    expect(within(container.querySelector('#emergency') as HTMLElement).getAllByRole('link')[0]).toHaveAttribute('href', 'tel:112');
    const checkOut = container.querySelector('#check-out') as HTMLElement;
    expect(await within(checkOut).findByText(checkoutSentence)).toBeInTheDocument();
    expect(within(checkOut).queryByText(/11:00/u)).toBeNull();
    expectCalmStayPage(container);
  });

  it.each(['en', 'el'] as const)('check-in lists the emergency numbers, 112 first (R3-L10, %s)', async (locale) => {
    session.isSignedIn = true;
    navigation.locale = locale;
    const { container } = wrap(await CheckInPage(params(locale)));

    const section = container.querySelector('#emergency') as HTMLElement;
    const hrefs = within(section).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs[0]).toBe('tel:112');
    expect(hrefs.filter((href) => href === 'tel:112')).toHaveLength(1);
    const title = getDictionary(locale).checkinInfo.emergencyTitle;
    const phones = getItemsByCategory('phones');
    const listed = phones.filter((item) => item.tags?.includes('emergency') && item.id !== 'emergency-112');
    expect(listed.length).toBeGreaterThanOrEqual(6);
    for (const item of listed) {
      const name = pickLocale(item, 'name', locale) ?? item.name;
      expect(within(section).getByRole('link', { name: `${title}: ${name}` })).toHaveAttribute('href', telHref(item.phone));
    }
    for (const item of phones.filter((entry) => !entry.tags?.includes('emergency'))) {
      expect(hrefs, item.id).not.toContain(telHref(item.phone));
    }
  });

  it('check-in without a session goes to sign-in', async () => {
    await expect(CheckInPage(params('en'))).rejects.toThrow('NEXT_REDIRECT /en/guest?flash=session_required');
  });

  it.each(['en', 'el'])('offline page (%s)', async (locale) => {
    const { container } = wrap(await OfflineLocalePage(params(locale)));
    expect(screen.getByRole('heading', { level: 1, name: locale === 'el' ? 'Είστε εκτός σύνδεσης' : "You're offline" })).toBeInTheDocument();
    // Nothing reloads the page by itself, so the lead points at the Retry button instead of promising it.
    const retry = locale === 'el' ? 'Επαναφόρτωση' : 'Retry';
    expect(container.querySelector('.status-page__lead')?.textContent?.endsWith(`${retry}.`)).toBe(true);
    expect(screen.getByRole('button', { name: retry })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /112/u })).toHaveAttribute('href', 'tel:112');
    expectCalmStayPage(container);
  });

  it('root offline page', () => {
    const { container } = wrap(<OfflinePage />);
    expect(screen.getByRole('heading', { level: 1, name: "You're offline" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /112/u })).toHaveAttribute('href', 'tel:112');
    expectCalmStayPage(container);
  });
});
