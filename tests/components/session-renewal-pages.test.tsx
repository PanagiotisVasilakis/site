import { beforeEach, describe, expect, it, vi } from 'vitest';

// Own next/headers and guestSession mocks: the ones of stay-routes.test.tsx never hold a refresh cookie.
const refreshCookie = vi.hoisted(() => ({ name: 'guest_rt', value: undefined as string | undefined }));
const verifiedSession = vi.hoisted(() => ({ current: null as { sid: string } | null }));
const flags = vi.hoisted(() => ({ portalEnabled: true, checkinEnabled: true }));

vi.mock('next/navigation', () => ({
  redirect: (target: string) => { throw new Error(`NEXT_REDIRECT ${target}`); },
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === refreshCookie.name && refreshCookie.value ? { value: refreshCookie.value } : undefined),
  }),
}));
vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: async () => ({ ...flags }) }));
vi.mock('@/lib/guestSession', () => ({
  GUEST_REFRESH_COOKIE: refreshCookie.name,
  getVerifiedGuestSessionFromCookies: async () => verifiedSession.current,
}));

import CheckInPage from '@/app/[locale]/check-in/page';
import GuestUnifiedPage from '@/app/[locale]/guest/page';
import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';
import PortalRefreshPage from '@/app/[locale]/portal/refresh/page';
import PortalRefreshRedirect from '@/components/PortalRefreshRedirect';

const params = (locale: string) => ({ params: Promise.resolve({ locale }) });
const refreshParams = (locale: string, search: { next?: string; failure?: string }) => ({
  params: Promise.resolve({ locale }),
  searchParams: Promise.resolve(search),
});

beforeEach(() => {
  flags.portalEnabled = true;
  flags.checkinEnabled = true;
  refreshCookie.value = undefined;
  verifiedSession.current = null;
});

describe('check-in page without a session', () => {
  it('sends a guest who still holds a refresh cookie to the session refresh page (en)', async () => {
    refreshCookie.value = 'refresh-token';
    await expect(CheckInPage(params('en'))).rejects.toThrow(
      new Error('NEXT_REDIRECT /en/portal/refresh?next=%2Fen%2Fcheck-in&failure=%2Fen%2Fguest%3Fflash%3Dsession_required'),
    );
  });

  it('sends a guest without a refresh cookie to sign-in', async () => {
    await expect(CheckInPage(params('en'))).rejects.toThrow(new Error('NEXT_REDIRECT /en/guest?flash=session_required'));
  });

  it('answers 404 while check-in is off, even for a guest with a refresh cookie', async () => {
    flags.checkinEnabled = false;
    refreshCookie.value = 'refresh-token';
    await expect(CheckInPage(params('en'))).rejects.toThrow(new Error('NEXT_NOT_FOUND'));
  });
});

describe('session refresh page', () => {
  it.each([
    {
      name: 'no links given',
      locale: 'en',
      search: {},
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      failureHref: '/en/guest?flash=session_required',
    },
    {
      name: 'off-site links (defaults used)',
      locale: 'en',
      search: { next: 'https://evil.test/x', failure: '//evil.test' },
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      failureHref: '/en/guest?flash=session_required',
    },
    {
      name: 'safe links, next encoded',
      locale: 'en',
      search: { next: '/en/stay?a=1&b=2', failure: '/en/guest?mode=signin' },
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fstay%3Fa%3D1%26b%3D2',
      failureHref: '/en/guest?mode=signin',
    },
  ])('hands the refresh component its links: $name', async ({ locale, search, refreshHref, failureHref }) => {
    const element = await PortalRefreshPage(refreshParams(locale, search));

    expect(element.type).toBe(PortalRefreshRedirect);
    expect(element.props).toEqual({ locale, refreshHref, failureHref });
  });
});

describe('guest sign-in page', () => {
  it('answers 404 while the portal is off', async () => {
    flags.portalEnabled = false;
    await expect(GuestUnifiedPage()).rejects.toThrow(new Error('NEXT_NOT_FOUND'));
  });

  it('serves the sign-in client while the portal is on', async () => {
    const element = await GuestUnifiedPage();

    expect(element.type).toBe(UnifiedGuestClient);
  });

  it('redirects an already signed-in guest away from /guest to /check-in (or /stay when check-in is off)', async () => {
    verifiedSession.current = { sid: 's1' };
    await expect(GuestUnifiedPage({ params: Promise.resolve({ locale: 'el' }) }))
      .rejects.toThrow(new Error('NEXT_REDIRECT /el/check-in'));

    flags.checkinEnabled = false;
    await expect(GuestUnifiedPage({ params: Promise.resolve({ locale: 'el' }) }))
      .rejects.toThrow(new Error('NEXT_REDIRECT /el/stay'));
  });

  it('routes a guest with a refresh cookie through /portal/refresh instead of asking for their password again', async () => {
    refreshCookie.value = 'refresh-token';
    await expect(GuestUnifiedPage({ params: Promise.resolve({ locale: 'el' }) }))
      .rejects.toThrow(new Error('NEXT_REDIRECT /el/portal/refresh?next=%2Fel%2Fcheck-in&failure=%2Fel%2Fguest%3Fflash%3Dsession_required'));
  });

  it('keeps the guest on the sign-up form when mode=signup even with an existing session', async () => {
    verifiedSession.current = { sid: 's1' };
    refreshCookie.value = 'refresh-token';

    const element = await GuestUnifiedPage({
      params: Promise.resolve({ locale: 'el' }),
      searchParams: Promise.resolve({ mode: 'signup' }),
    });

    expect(element.type).toBe(UnifiedGuestClient);
  });
});
