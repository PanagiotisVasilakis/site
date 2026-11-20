// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OfflineActions from '@/components/OfflineActions';

// The service worker answers a page it cannot open with a redirect to /{locale}/offline?from=<page> (R-648), so this
// page hydrates at its own URL; Retry goes back to `from`. The page leaves through location.assign or
// location.reload; unstubGlobals in vitest.config.ts restores location after each test.
function openOfflinePage(search: string) {
  const assign = vi.fn<(destination: string) => void>();
  const reload = vi.fn<() => void>();
  vi.stubGlobal('location', { ...window.location, search, assign, reload });
  return { assign, reload };
}

// The worker puts the whole page (path and query) into `from`, percent-encoded.
const fromQuery = (from: string) => `?from=${encodeURIComponent(from)}`;

function pressRetry() {
  render(<OfflineActions retryLabel="Retry" links={[{ href: '/en', label: 'Home' }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
}

describe('offline page actions (R-648)', () => {
  describe('Retry', () => {
    it.each([
      '/en/moments?category=beaches&sort=name',
      '/en/phones?next=%2Fen%3Fa%3D1&b=2',
      '/el/%CE%BC%CE%BF%CE%B9',
    ])('goes back to the page the worker could not open: %s', (from) => {
      const { assign, reload } = openOfflinePage(fromQuery(from));

      pressRetry();

      expect(assign).toHaveBeenCalledExactlyOnceWith(from);
      expect(reload).not.toHaveBeenCalled();
    });

    it('reads `from` of the current address, whatever else the query holds', () => {
      const { assign, reload } = openOfflinePage(`?utm=x&from=${encodeURIComponent('/en/moments?a=1')}&other=y`);

      pressRetry();

      expect(assign).toHaveBeenCalledExactlyOnceWith('/en/moments?a=1');
      expect(reload).not.toHaveBeenCalled();
    });

    it.each([
      ['an absolute URL of another site', 'https://evil.example/en/moments'],
      // toSafeLocalPath refuses these: they canonicalize to `//evil.example/…`, which `location.assign` would read as another site.
      ['a dot segment hiding a second slash', '/.//evil.example/en/moments'],
      ['an encoded backslash', '/%5Cevil.example'],
      ['an empty value', ''],
    ])('reloads instead when `from` is %s', (_label, from) => {
      const { assign, reload } = openOfflinePage(fromQuery(from));

      pressRetry();

      expect(assign).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledOnce();
    });

    it.each([
      '/offline',
      '/en/offline?from=%2Fen%2Fmoments',
      '/el/offline#top',
      '/en/../el/offline',
    ])('reloads instead when `from` is an offline page: %s', (from) => {
      const { assign, reload } = openOfflinePage(fromQuery(from));

      pressRetry();

      expect(assign).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledOnce();
    });

    it.each([
      ['a query string without `from`', '?x=1&other=%2Fen%2Fmoments'],
      ['an empty `from`', '?from='],
    ])('reloads when the address has %s', (_label, search) => {
      const { assign, reload } = openOfflinePage(search);

      pressRetry();

      expect(assign).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledOnce();
    });
  });
});
