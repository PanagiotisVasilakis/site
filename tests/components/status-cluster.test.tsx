// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import StatusCluster from '@/components/StatusCluster';

const LABELS = { online: 'Online', offline: 'Offline', reconnecting: 'Back online', slow: 'Slow connection' };
const MINUTE = 60_000;

const fetchMock = vi.fn();

// The pill is displayed below Tailwind's sm breakpoint only; the test drives that media query by hand.
function installDisplayMedia(initiallyDisplayed: boolean) {
  let displayed = initiallyDisplayed;
  const listeners = new Set<() => void>();
  const matchMedia = vi.fn((query: string) => ({
    media: query,
    get matches() { return displayed; },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    listenerCount: () => listeners.size,
    resize(next: boolean) {
      displayed = next;
      listeners.forEach((listener) => listener());
    },
  };
}

function setBrowserOnline(online: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online);
}

function setTabHidden(hidden: boolean) {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function dispatchOnWindow(type: 'online' | 'offline') {
  await act(async () => {
    window.dispatchEvent(new Event(type));
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function switchTab(hidden: boolean) {
  setTabHidden(hidden);
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  });
}

function pillState() {
  return screen.getByRole('status').getAttribute('data-state');
}

async function renderPill() {
  const view = render(<StatusCluster labels={LABELS} />);
  await advance(0);
  return view;
}

describe('StatusCluster', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    setBrowserOnline(true);
    setTabHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('breakpoint', () => {
    it('asks the complement of the wrapper breakpoint (sm:hidden = from 40rem up)', async () => {
      const { matchMedia } = installDisplayMedia(true);
      await renderPill();

      expect(matchMedia).toHaveBeenCalledWith('(width < 40rem)');
    });

    it('stays in step with the wrapper class in the locale layout and Tailwind sm of 40rem', () => {
      const layout = readFileSync(path.join(process.cwd(), 'src/app/[locale]/layout.tsx'), 'utf8');
      expect(layout).toMatch(/className="[^"]*\bsm:hidden\b[^"]*">\s*<StatusCluster/u);
      const theme = readFileSync(path.join(process.cwd(), 'node_modules/tailwindcss/theme.css'), 'utf8');
      expect(theme).toMatch(/--breakpoint-sm:\s*40rem;/u);
    });
  });

  describe('probe cadence', () => {
    it('sends one uncached HEAD request when the pill appears', async () => {
      installDisplayMedia(true);
      await renderPill();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/^\/app\.webmanifest\?probe=\d+$/u);
      expect(init).toMatchObject({ method: 'HEAD', cache: 'no-store' });
      expect(pillState()).toBe('online');
    });

    it('probes at most once a minute while the tab is visible and the pill is displayed', async () => {
      installDisplayMedia(true);
      await renderPill();

      await advance(MINUTE - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await advance(3 * MINUTE);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('never probes while the pill is not displayed, and starts when the viewport becomes narrow', async () => {
      const media = installDisplayMedia(false);
      await renderPill();
      await advance(5 * MINUTE);
      expect(fetchMock).not.toHaveBeenCalled();

      media.resize(true);
      await advance(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      media.resize(false);
      await advance(5 * MINUTE);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('still probes where matchMedia is unavailable, so the indicator keeps working', async () => {
      vi.stubGlobal('matchMedia', undefined);
      await renderPill();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not probe while the tab is hidden and probes on return once the last result is a minute old', async () => {
      installDisplayMedia(true);
      await renderPill();
      await switchTab(true);

      await advance(5 * MINUTE);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await switchTab(false);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not probe again on a quick return to the tab while the last result is fresh', async () => {
      installDisplayMedia(true);
      await renderPill();
      await advance(20_000);

      await switchTab(true);
      await switchTab(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await advance(MINUTE - 20_000 - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries a failed probe every 15 seconds while the browser reports online, then returns to the minute', async () => {
      installDisplayMedia(true);
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await renderPill();
      expect(pillState()).toBe('offline');
      expect(screen.getByText(LABELS.offline)).toBeInTheDocument();

      await advance(14_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(pillState()).toBe('online');

      await advance(MINUTE - 1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await advance(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('treats a probe that takes longer than 4 seconds as a failure', async () => {
      installDisplayMedia(true);
      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
      }));
      await renderPill();
      expect(pillState()).toBe('online');

      await advance(3_999);
      expect(pillState()).toBe('online');
      await advance(1);
      expect(pillState()).toBe('offline');
    });
  });

  describe('offline indicator', () => {
    it('follows the online and offline events without any request', async () => {
      installDisplayMedia(false);
      await renderPill();

      setBrowserOnline(false);
      await dispatchOnWindow('offline');
      expect(pillState()).toBe('offline');

      setBrowserOnline(true);
      await dispatchOnWindow('online');
      expect(pillState()).toBe('reconnecting');
      await advance(2_500);
      expect(pillState()).toBe('online');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not poll while the browser reports offline and probes at once when it reports online again', async () => {
      installDisplayMedia(true);
      setBrowserOnline(false);
      await renderPill();
      expect(pillState()).toBe('offline');

      await advance(5 * MINUTE);
      expect(fetchMock).not.toHaveBeenCalled();

      setBrowserOnline(true);
      await dispatchOnWindow('online');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await advance(2_500);
      expect(pillState()).toBe('online');
    });

    it('probes at once on the online event after a recent good probe, then waits a minute again', async () => {
      installDisplayMedia(true);
      await renderPill();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await advance(10_000);
      setBrowserOnline(false);
      await dispatchOnWindow('offline');
      expect(pillState()).toBe('offline');
      await advance(5_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      setBrowserOnline(true);
      await dispatchOnWindow('online');
      // Not left waiting for the earlier result's minute: the verifying probe runs on the event.
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await advance(MINUTE - 1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await advance(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('drops a probe that is still running when the browser goes offline', async () => {
      installDisplayMedia(true);
      let finish!: (response: Response) => void;
      fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
      await renderPill();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      setBrowserOnline(false);
      await dispatchOnWindow('offline');
      await act(async () => { finish(new Response(null, { status: 200 })); await vi.advanceTimersByTimeAsync(0); });
      await advance(5 * MINUTE);

      expect(pillState()).toBe('offline');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('stops probing and removes its listeners on unmount', async () => {
    const media = installDisplayMedia(true);
    const view = await renderPill();
    expect(media.listenerCount()).toBe(1);

    view.unmount();
    expect(media.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await advance(5 * MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts a probe that is still running on unmount', async () => {
    installDisplayMedia(true);
    let signal: AbortSignal | null | undefined;
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      signal = init.signal;
      return new Promise<Response>(() => {});
    });
    const view = await renderPill();
    expect(signal?.aborted).toBe(false);

    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
