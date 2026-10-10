// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
  return { locale: 'en', search: 'mode=signup', router };
});
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: navigation.locale }),
  useRouter: () => navigation.router,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import UnifiedGuestClient from '@/app/[locale]/guest/UnifiedGuestClient';

// The legacy transport carried the one-time claim token in the query or in the fragment
// (docs/security/claim-token-transport.md). No value from there is ever used.
const LEGACY_URL = '/en/guest?mode=signup&claim=AAA&claimToken=BBB&x=1#claimToken=CCC';

describe('guest page claim URL scrubbing', () => {
  beforeEach(() => { navigation.search = 'mode=signup'; });
  // jsdom keeps the address and the history entries across the tests of a file.
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('removes the legacy claim query values and fragment from the current history entry', () => {
    window.history.replaceState(null, '', LEGACY_URL);
    const entries = window.history.length;

    render(<UnifiedGuestClient />);

    expect(window.location.pathname).toBe('/en/guest');
    expect(window.location.search).toBe('?mode=signup&x=1');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toMatch(/AAA|BBB|CCC/u);
    // The entry is replaced, not added: Back must not lead to the URL that carried the values.
    expect(window.history.length).toBe(entries);
  });

  it.each([
    ['a claim query value', '/en/guest?claim=AAA', '', ''],
    ['a claimToken query value', '/en/guest?mode=signup&claimToken=BBB', '?mode=signup', ''],
    ['repeated legacy query names', '/en/guest?claim=AAA&claim=A2&claimToken=BBB&claimToken=B2&x=1', '?x=1', ''],
    ['a claim fragment', '/en/guest?mode=signup#claim=CCC', '?mode=signup', ''],
    ['a claimToken fragment', '/en/guest#claimToken=CCC', '', ''],
    ['a claim fragment among other parts and in any letter case', '/en/guest#x=1&CLAIMTOKEN=CCC', '', ''],
  ])('removes %s', (_label, url, search, hash) => {
    window.history.replaceState(null, '', url);

    render(<UnifiedGuestClient />);

    expect(window.location.search).toBe(search);
    expect(window.location.hash).toBe(hash);
  });

  it('leaves a URL without legacy values untouched and does not rewrite the history', () => {
    const url = '/en/guest?mode=signup&x=1#contact';
    window.history.replaceState(null, '', url);
    const replaceState = vi.spyOn(window.history, 'replaceState');

    render(<UnifiedGuestClient />);

    expect(replaceState).not.toHaveBeenCalled();
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(url);
  });

  it('keeps the history state of the entry it scrubs', () => {
    window.history.replaceState({ marker: 'router-state' }, '', '/en/guest?claim=AAA');

    render(<UnifiedGuestClient />);

    expect(window.location.search).toBe('');
    expect(window.history.state).toEqual({ marker: 'router-state' });
  });

  it('never uses the legacy values: no request is sent and the token field stays empty', () => {
    window.history.replaceState(null, '', LEGACY_URL);

    render(<UnifiedGuestClient />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById('claim-token')).toHaveValue('');
  });

  it('does not carry the legacy names into the URL it builds when the guest switches tab', () => {
    navigation.search = 'mode=signup&claim=AAA&claimToken=BBB&x=1';
    render(<UnifiedGuestClient />);

    fireEvent.click(document.getElementById('tab-signin')!);

    expect(navigation.router.replace).toHaveBeenCalledTimes(1);
    expect(navigation.router.replace).toHaveBeenCalledWith('/en/guest?mode=signin&x=1', { scroll: false });
  });
});
