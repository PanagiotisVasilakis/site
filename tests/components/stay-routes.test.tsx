// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ locale: 'en', search: '' }));
const flags = vi.hoisted(() => ({ portalEnabled: true, checkinEnabled: true }));
const session = vi.hoisted(() => ({
  isSignedIn: false,
  portalEnabled: true,
  checkinEnabled: true,
  flagsLoaded: false,
}));
const fetchMock = vi.hoisted(() => vi.fn());
const preferences = vi.hoisted(() => ({ checkOutTime: '11:00' }));
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
vi.mock('@/hooks/useGuestSession', () => ({
  useGuestSession: () => ({
    isSignedIn: session.isSignedIn,
    portalEnabled: session.portalEnabled,
    checkinEnabled: session.checkinEnabled,
    flagsLoaded: session.flagsLoaded,
    signOut: vi.fn(),
  }),
}));
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
import CheckInPage from '@/app/[locale]/check-in/page';
import OfflineLocalePage from '@/app/[locale]/offline/page';
import OfflinePage from '@/app/offline/page';
import { ToastProvider } from '@/components/Toast';
import { favoriteIdOf } from '@/components/guide/guideEntries';
import { categories } from '@/data/categories';
import { getDictionary } from '@/i18n/dictionaries';
import { telHref } from '@/lib/contactLinks';
import { getItemsByCategory } from '@/lib/data';
import { pickLocale } from '@/lib/localize';

const wrap = (node: ReactNode) => render(<ToastProvider>{node}</ToastProvider>);
const params = (locale: string) => ({ params: Promise.resolve({ locale }) });

function expectNoBookingCta(container: HTMLElement) {
  const hrefs = Array.from(container.querySelectorAll('a[href]'), (link) => link.getAttribute('href') ?? '');
  expect(hrefs.filter((href) => /booking\.com|\/availability/iu.test(href))).toEqual([]);
  expect(container.querySelector('canvas')).toBeNull();
}

beforeEach(() => {
  navigation.locale = 'en';
  navigation.search = '';
  flags.portalEnabled = true;
  flags.checkinEnabled = true;
  session.isSignedIn = false;
  session.portalEnabled = true;
  session.checkinEnabled = true;
  session.flagsLoaded = false;
  preferences.checkOutTime = '11:00';
  phonesOrder.nonEmergencyFirst = false;
  window.localStorage.clear();
  fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify({
    success: true,
    data: url === '/api/check-in/preferences'
      ? { checkInTime: '15:00', checkOutTime: preferences.checkOutTime, wifi: { network: 'Guest-Net', password: 'p4ss-w0rd' } }
      : { request: null },
  }), { status: 200 }));
});

describe('/{l}/stay hub (identity §9.4)', () => {
  it('shows locked tiles, emergency phones, guide search, and valid favourite count while signed out', async () => {
    const known = categories.flatMap((c) => getItemsByCategory(c.id).map((item) => favoriteIdOf(c, item))).slice(0, 2);
    window.localStorage.setItem('favorites:v1', JSON.stringify([...known, 'moments:removed-place']));
    const { container } = wrap(await StayPage(params('en')));

    expect(screen.getByRole('link', { name: /Sign in to your stay/u })).toHaveAttribute('href', '/en/guest');
    for (const name of ['Wi-Fi', 'Check-out', 'House rules']) {
      const tile = screen.getByRole('heading', { name }).closest('.stay-tile') as HTMLElement;
      expect(tile).toHaveClass('stay-tile--locked');
      expect(within(tile).queryByRole('link')).toBeNull();
    }
    const phones = screen.getByRole('heading', { name: 'Important phones' }).closest('.stay-tile') as HTMLElement;
    const calls = within(phones).getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('tel:'));
    expect(calls.map((link) => link.getAttribute('href'))).toEqual(['tel:112', 'tel:166', 'tel:199']);
    const search = screen.getByRole('searchbox');
    expect(search.closest('form')).toHaveAttribute('action', '/en/moments');
    expect(await within(screen.getByRole('link', { name: /Favourites/u })).findByText('2')).toBeInTheDocument();
    expectNoBookingCta(container);
  });

  it('lists only emergency numbers in the phones tile even when other entries come first', async () => {
    phonesOrder.nonEmergencyFirst = true;
    const others = getItemsByCategory('phones').filter((item) => !item.tags?.includes('emergency') && item.phone);
    expect(others.length).toBeGreaterThanOrEqual(2);
    wrap(await StayPage(params('en')));

    const phones = screen.getByRole('heading', { name: 'Important phones' }).closest('.stay-tile') as HTMLElement;
    const hrefs = within(phones).getAllByRole('link').map((l) => l.getAttribute('href')).filter((h) => h?.startsWith('tel:'));
    expect(hrefs).toEqual(['tel:112', 'tel:166', 'tel:199']);
    for (const item of others) expect(hrefs, item.id).not.toContain(telHref(item.phone));
  });

  it('unlocks check-in links when signed in and hides check-in/portal tiles when feature flags disable them', async () => {
    session.isSignedIn = true;
    const active = wrap(await StayPage(params('en')));
    expect(screen.getByRole('link', { name: /Open your check-in/u })).toHaveAttribute('href', '/en/check-in');
    expect(screen.getByRole('link', { name: /Wi-Fi/u })).toHaveAttribute('href', '/en/check-in#wifi');
    expect(active.container.querySelector('.stay-tile--locked')).toBeNull();
    expectNoBookingCta(active.container);
    active.unmount();

    flags.checkinEnabled = false;
    const noCheckin = wrap(await StayPage(params('en')));
    expect(noCheckin.container.querySelector('a[href^="/en/check-in"]')).toBeNull();
    expect(noCheckin.container.querySelector('.stay-tile--portal, .stay-tile--locked')).toBeNull();
    noCheckin.unmount();

    session.isSignedIn = false;
    flags.portalEnabled = false;
    const noPortal = wrap(await StayPage(params('el')));
    expect(noPortal.container.querySelector('a[href^="/el/guest"], a[href^="/el/check-in"]')).toBeNull();
    expect(screen.getByRole('link', { name: /112/u })).toHaveAttribute('href', 'tel:112');
    noPortal.unmount();

    session.isSignedIn = true;
    flags.portalEnabled = true;
    flags.checkinEnabled = true;
    session.flagsLoaded = true;
    session.checkinEnabled = false;
    const clientFlagOff = wrap(await StayPage(params('en')));
    expect(clientFlagOff.container.querySelector('a[href^="/en/check-in"]')).toBeNull();
  });
});

describe('check-in and offline stay routes', () => {
  it('renders loaded Wi-Fi, updated check-out time, and emergency-only phone numbers in check-in', async () => {
    session.isSignedIn = true;
    preferences.checkOutTime = '10:30';
    const { container } = wrap(await CheckInPage(params('el')));

    expect((await screen.findAllByText('Guest-Net')).length).toBeGreaterThan(0);
    const checkOut = container.querySelector('#check-out') as HTMLElement;
    expect(await within(checkOut).findByText('Παρακαλούμε αναχωρήστε έως τις 10:30.')).toBeInTheDocument();
    expect(within(checkOut).queryByText(/11:00/u)).toBeNull();

    const section = container.querySelector('#emergency') as HTMLElement;
    const hrefs = within(section).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs[0]).toBe('tel:112');
    const phones = getItemsByCategory('phones');
    const title = getDictionary('el').checkinInfo.emergencyTitle;
    for (const item of phones.filter((i) => i.tags?.includes('emergency') && i.id !== 'emergency-112')) {
      const name = pickLocale(item, 'name', 'el') ?? item.name;
      expect(within(section).getByRole('link', { name: `${title}: ${name}` })).toHaveAttribute('href', telHref(item.phone));
    }
    for (const item of phones.filter((i) => !i.tags?.includes('emergency'))) {
      expect(hrefs, item.id).not.toContain(telHref(item.phone));
    }
    expectNoBookingCta(container);
  });

  it('renders localized and root offline pages with retry and 112 and no booking CTA', async () => {
    const elOffline = wrap(await OfflineLocalePage(params('el')));
    expect(screen.getByRole('button', { name: 'Επαναφόρτωση' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /112/u })).toHaveAttribute('href', 'tel:112');
    expectNoBookingCta(elOffline.container);
    elOffline.unmount();

    const rootOffline = wrap(<OfflinePage />);
    expect(screen.getByRole('heading', { level: 1, name: "You're offline" })).toBeInTheDocument();
    expectNoBookingCta(rootOffline.container);
  });
});
