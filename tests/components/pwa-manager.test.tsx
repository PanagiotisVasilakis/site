// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }));
vi.mock('@/lib/logger-client', () => ({ logger }));

// A plain function, not vi.fn: `mockReset` must not clear the pathname between renders of one test.
const navigation = vi.hoisted(() => ({ pathname: '/en/stay' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

import PwaManager from '@/components/PwaManager';

type FakeWorker = { postMessage: ReturnType<typeof vi.fn> };

type FakeRegistration = {
  waiting: FakeWorker | null;
  addEventListener: ReturnType<typeof vi.fn>;
};

function fakeRegistration(): FakeRegistration {
  return { waiting: null, addEventListener: vi.fn() };
}

describe('PwaManager service worker registration (R-253)', () => {
  let container: {
    controller: null;
    register: ReturnType<typeof vi.fn>;
    getRegistration: ReturnType<typeof vi.fn>;
    getRegistrations: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Take the production code path in the test runtime.
    vi.stubEnv('NEXT_PUBLIC_FORCE_SW_DEV', '1');
    container = {
      controller: null,
      register: vi.fn(async () => fakeRegistration()),
      getRegistration: vi.fn(async () => undefined),
      getRegistrations: vi.fn(async () => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('registers the versioned worker URL when /version.json answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ version: '1.2.3', build: 'abc def' })));
    render(<PwaManager />);
    await waitFor(() => expect(container.register).toHaveBeenCalledTimes(1));
    expect(container.register).toHaveBeenCalledWith('/sw.js?v=1.2.3&build=abc%20def');
  });

  it('never registers the unversioned worker when /version.json answers non-OK; it attaches to the existing registration', async () => {
    const existing = fakeRegistration();
    container.getRegistration.mockResolvedValue(existing);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad gateway', { status: 503 })));
    render(<PwaManager />);
    await waitFor(() => expect(existing.addEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function), expect.anything()));
    expect(container.register).not.toHaveBeenCalled();
  });

  it('never registers the unversioned worker when /version.json lacks version or build', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ version: '1.2.3' })));
    render(<PwaManager />);
    await waitFor(() => expect(container.getRegistration).toHaveBeenCalled());
    expect(container.register).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalledWith('Service worker registration failed', expect.anything());
  });

  it('never registers the unversioned worker when offline and there is no registration yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    render(<PwaManager />);
    await waitFor(() => expect(container.getRegistration).toHaveBeenCalled());
    expect(container.register).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalledWith('Service worker registration failed', expect.anything());
  });
});

const IPHONE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// The update banner and the iOS tip as src/app/[locale]/layout.tsx renders them: hidden until PwaManager sets an inline display.
function ShellWithPwaManager() {
  return (
    <>
      <PwaManager />
      <div id="update-banner" className="hidden">
        <span>Update available</span>
        <button id="update-reload-btn" type="button">Refresh</button>
        <button id="update-dismiss-btn" type="button">Dismiss</button>
      </div>
      <div id="ios-a2hs-tip" className="hidden">
        <span>Add to Home Screen</span>
        <button id="ios-tip-close" type="button">Close</button>
      </div>
    </>
  );
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} is not rendered`);
  return found;
}

describe('PwaManager site storage (R-375)', () => {
  let container: {
    controller: FakeWorker | null;
    register: ReturnType<typeof vi.fn>;
    getRegistration: ReturnType<typeof vi.fn>;
    getRegistrations: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  // The worker that controls the page, and a newer worker that waits to take over (public/sw.js answers REQUEST_VERSION to the sender).
  let controllerWorker: FakeWorker;
  let waitingWorker: FakeWorker;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_FORCE_SW_DEV', '1');
    controllerWorker = { postMessage: vi.fn() };
    waitingWorker = { postMessage: vi.fn() };
    container = {
      controller: null,
      register: vi.fn(async () => fakeRegistration()),
      getRegistration: vi.fn(async () => undefined),
      getRegistrations: vi.fn(async () => []),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ version: '1.2.3', build: 'abc' })));
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(navigator, 'userAgent');
  });

  function workerMessageListener(): (event: MessageEvent) => void {
    const listener = container.addEventListener.mock.calls.find(([type]) => type === 'message')?.[1];
    if (!listener) throw new Error('PwaManager registered no message listener');
    return listener;
  }

  // `source` is the worker that answered: in a browser it is the very object of navigator.serviceWorker.controller
  // for the active worker, and of registration.waiting for the waiting one.
  function runtimeVersionMessage(version: string, build: string, source: FakeWorker | null): MessageEvent {
    return { data: { type: 'RUNTIME_VERSION', meta: { version, build } }, source } as MessageEvent;
  }

  describe('when the browser blocks site data', () => {
    beforeEach(() => {
      // What "block all site data" does: every localStorage access throws a SecurityError.
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    });

    it('mounts without throwing and still registers the worker', async () => {
      expect(() => render(<PwaManager />)).not.toThrow();
      await waitFor(() => expect(container.register).toHaveBeenCalledWith('/sw.js?v=1.2.3&build=abc'));
    });

    it('shows the iOS tip and still hides it on close when the dismissal cannot be stored', () => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: IPHONE_USER_AGENT });
      render(<ShellWithPwaManager />);
      const tip = element('ios-a2hs-tip');
      expect(tip.style.display).toBe('flex');

      fireEvent.click(element('ios-tip-close'));
      expect(tip.style.display).toBe('none');
    });

    it('shows the update banner for a waiting worker although the dismissed version cannot be read', async () => {
      container.register.mockResolvedValue({ waiting: { postMessage: vi.fn() }, addEventListener: vi.fn() });
      render(<ShellWithPwaManager />);
      await waitFor(() => expect(element('update-banner').style.display).toBe('flex'));
    });

    it('hides the update banner on dismiss although the dismissal cannot be stored', () => {
      render(<ShellWithPwaManager />);
      const banner = element('update-banner');
      banner.setAttribute('data-update-key', '1.2.3:abc');
      banner.style.display = 'flex';

      fireEvent.click(element('update-dismiss-btn'));
      expect(banner.style.display).toBe('none');
    });

    it('reloads for an update although the new version cannot be stored', async () => {
      const reload = vi.fn();
      vi.stubGlobal('location', { ...window.location, reload });
      render(<ShellWithPwaManager />);
      const banner = element('update-banner');
      banner.setAttribute('data-new-version', '1.2.3');
      banner.setAttribute('data-new-build', 'abc');

      fireEvent.click(element('update-reload-btn'));
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(logger.error).not.toHaveBeenCalledWith('Update reload handler failed', expect.anything());
    });

    it('handles the runtime version message of the worker without throwing', () => {
      container.controller = controllerWorker;
      render(<ShellWithPwaManager />);
      const onMessage = workerMessageListener();

      expect(() => onMessage(runtimeVersionMessage('1.2.3', 'abcdef0123456789', waitingWorker))).not.toThrow();
      expect(() => onMessage(runtimeVersionMessage('1.2.3', 'abcdef0123456789', controllerWorker))).not.toThrow();
    });

    it('shows the update banner for a new worker version although the dismissed version cannot be read', () => {
      // Only the lookup of the dismissed version is denied here; the stored version is still readable.
      vi.mocked(Storage.prototype.getItem).mockImplementation((key: string) => {
        if (key === 'app-version') return '1.0.0';
        if (key === 'app-build') return 'oldbuild0123';
        throw new DOMException('blocked', 'SecurityError');
      });
      container.controller = controllerWorker;
      render(<ShellWithPwaManager />);

      workerMessageListener()(runtimeVersionMessage('2.0.0', 'newbuild0123', waitingWorker));
      const banner = element('update-banner');
      expect(banner.style.display).toBe('flex');
      expect(banner).toHaveTextContent('Update available: 1.0.0 → 2.0.0');
    });

    it('also survives a browser that denies access to navigator.serviceWorker', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get() { throw new DOMException('Access to service workers is denied in this document.', 'SecurityError'); },
      });
      expect(() => render(<ShellWithPwaManager />)).not.toThrow();
      // The registration attempt is the part that was already guarded: it is logged, not thrown.
      await waitFor(() => expect(logger.error).toHaveBeenCalledWith('Service worker registration failed', expect.anything()));
    });
  });

  describe('when site storage works', () => {
    it('remembers a closed iOS tip', () => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: IPHONE_USER_AGENT });
      const first = render(<ShellWithPwaManager />);
      expect(element('ios-a2hs-tip').style.display).toBe('flex');

      fireEvent.click(element('ios-tip-close'));
      expect(element('ios-a2hs-tip').style.display).toBe('none');
      expect(localStorage.getItem('ios-a2hs-dismissed')).toBe('1');

      first.unmount();
      render(<ShellWithPwaManager />);
      expect(element('ios-a2hs-tip').style.display).toBe('');
    });

    it('stores the worker version, offers the update once it changes and keeps a dismissed update hidden', () => {
      container.controller = controllerWorker;
      render(<ShellWithPwaManager />);
      const onMessage = workerMessageListener();
      const banner = element('update-banner');

      onMessage(runtimeVersionMessage('1.0.0', 'oldbuild0123', controllerWorker));
      expect(localStorage.getItem('app-version')).toBe('1.0.0');
      expect(localStorage.getItem('app-build')).toBe('oldbuild0123');
      expect(banner.style.display).toBe('');

      onMessage(runtimeVersionMessage('2.0.0', 'newbuild0123', waitingWorker));
      expect(banner.style.display).toBe('flex');
      expect(banner).toHaveTextContent('Update available: 1.0.0 → 2.0.0');

      fireEvent.click(element('update-dismiss-btn'));
      expect(banner.style.display).toBe('none');
      expect(localStorage.getItem('update-dismissed-version')).toBe('2.0.0:newbuild0123');

      onMessage(runtimeVersionMessage('2.0.0', 'newbuild0123', waitingWorker));
      expect(banner.style.display).toBe('none');
    });

    // R-688: a waiting worker that activated by itself (every tab closed) answers REQUEST_VERSION as the controller on
    // the next visit; that is the running version, not an update.
    it('takes the version of the controlling worker as the baseline instead of offering it as an update (R-688)', () => {
      localStorage.setItem('app-version', '0.1.1');
      localStorage.setItem('app-build', 'probe-a');
      container.controller = controllerWorker;
      render(<ShellWithPwaManager />);
      const onMessage = workerMessageListener();
      const banner = element('update-banner');

      onMessage(runtimeVersionMessage('0.1.2', 'probe-b', controllerWorker));
      expect(banner.style.display).toBe('');
      expect(banner).toHaveTextContent('Update available');
      expect(banner).not.toHaveAttribute('data-update-key');
      expect(localStorage.getItem('app-version')).toBe('0.1.2');
      expect(localStorage.getItem('app-build')).toBe('probe-b');

      // The baseline moved on: a later update names the version that actually runs.
      onMessage(runtimeVersionMessage('0.1.3', 'probe-c', waitingWorker));
      expect(banner.style.display).toBe('flex');
      expect(banner).toHaveTextContent('Update available: 0.1.2 → 0.1.3');
      expect(localStorage.getItem('app-version')).toBe('0.1.2');
    });

    it('does not treat a message without a source as the controller when no worker controls the page', () => {
      localStorage.setItem('app-version', '1.0.0');
      localStorage.setItem('app-build', 'oldbuild0123');
      render(<ShellWithPwaManager />);

      workerMessageListener()(runtimeVersionMessage('2.0.0', 'newbuild0123', null));

      expect(element('update-banner').style.display).toBe('flex');
      expect(localStorage.getItem('app-version')).toBe('1.0.0');
    });

    it('activates the waiting worker on Refresh, then stores its version and reloads', async () => {
      const reload = vi.fn();
      vi.stubGlobal('location', { ...window.location, reload });
      container.controller = controllerWorker;
      container.getRegistration.mockResolvedValue({ waiting: waitingWorker, addEventListener: vi.fn() });
      render(<ShellWithPwaManager />);
      const onMessage = workerMessageListener();
      onMessage(runtimeVersionMessage('1.0.0', 'oldbuild0123', controllerWorker));
      onMessage(runtimeVersionMessage('2.0.0', 'newbuild0123', waitingWorker));
      expect(element('update-banner').style.display).toBe('flex');

      fireEvent.click(element('update-reload-btn'));
      await waitFor(() => expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }));
      // The reload waits for the new worker to take control.
      expect(reload).not.toHaveBeenCalled();
      expect(localStorage.getItem('app-version')).toBe('1.0.0');

      const onControllerChange = container.addEventListener.mock.calls.find(([type]) => type === 'controllerchange')?.[1];
      if (!onControllerChange) throw new Error('Refresh registered no controllerchange listener');
      onControllerChange();

      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(localStorage.getItem('app-version')).toBe('2.0.0');
      expect(localStorage.getItem('app-build')).toBe('newbuild0123');
      expect(container.removeEventListener).toHaveBeenCalledWith('controllerchange', onControllerChange);
      expect(logger.error).not.toHaveBeenCalledWith('Update reload handler failed', expect.anything());
    });
  });
});

type CachePageWorker = { postMessage: ReturnType<typeof vi.fn> };

// A real EventTarget, so that `{ once: true }` and the abort signal of `addEventListener` behave as in a browser.
type CachePageContainer = EventTarget & {
  controller: CachePageWorker | null;
  register: ReturnType<typeof vi.fn>;
  getRegistration: ReturnType<typeof vi.fn>;
  getRegistrations: ReturnType<typeof vi.fn>;
};

// R-628: the worker stores a page only for a full navigation, so PwaManager hands it the pages reached by a
// client-side navigation (a tap on a next/link).
describe('PwaManager hands visited pages to the service worker (R-628)', () => {
  const ORIGIN = window.location.origin;
  let container: CachePageContainer;
  let worker: CachePageWorker;

  function cachePageMessages() {
    return worker.postMessage.mock.calls.map(([message]) => message).filter((message) => message?.type === 'CACHE_PAGE');
  }

  // The document the browser loaded: Navigation Timing reports its URL (the hash is not part of what was fetched).
  function loadedDocument(url: string) {
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type) => (
      type === 'navigation' ? [{ name: url } as PerformanceNavigationTiming] : []
    ));
  }

  // Next.js pushes the new URL to the history and then re-renders with the new pathname.
  function softNavigate(path: string, rerender: () => void) {
    window.history.pushState({}, '', path);
    navigation.pathname = path.split(/[?#]/u)[0];
    rerender();
  }

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_FORCE_SW_DEV', '1');
    worker = { postMessage: vi.fn() };
    container = Object.assign(new EventTarget(), {
      controller: worker as CachePageWorker | null,
      register: vi.fn(async () => fakeRegistration()),
      getRegistration: vi.fn(async () => undefined),
      getRegistrations: vi.fn(async () => []),
    });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ version: '1.2.3', build: 'abc' })));
    navigation.pathname = '/en/stay';
    window.history.replaceState({}, '', '/en/stay');
    loadedDocument(`${ORIGIN}/en/stay`);
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    navigation.pathname = '/en/stay';
    window.history.replaceState({}, '', '/');
  });

  it('posts nothing on mount when a worker controls the page that the browser loaded', () => {
    render(<PwaManager />);

    expect(cachePageMessages()).toEqual([]);
  });

  it('posts the page it landed on after every pathname change, without its hash', () => {
    const { rerender } = render(<PwaManager />);

    softNavigate('/en/moments', () => rerender(<PwaManager />));
    softNavigate('/en/moments/viktoria?from=guide#photos', () => rerender(<PwaManager />));

    expect(cachePageMessages()).toEqual([
      { type: 'CACHE_PAGE', url: `${ORIGIN}/en/moments` },
      { type: 'CACHE_PAGE', url: `${ORIGIN}/en/moments/viktoria?from=guide` },
    ]);
  });

  it('posts nothing for a render that does not change the pathname', () => {
    const { rerender } = render(<PwaManager />);

    rerender(<PwaManager />);
    window.history.pushState({}, '', '/en/stay#hours');
    rerender(<PwaManager />);

    expect(cachePageMessages()).toEqual([]);
  });

  it('posts the current page on mount when a soft navigation happened before it mounted', () => {
    // PwaManager mounts when the browser is idle: the guest may have tapped a link by then.
    loadedDocument(`${ORIGIN}/en/stay`);
    window.history.pushState({}, '', '/en/phones');
    navigation.pathname = '/en/phones';

    render(<PwaManager />);

    expect(cachePageMessages()).toEqual([{ type: 'CACHE_PAGE', url: `${ORIGIN}/en/phones` }]);
  });

  it('does not take the hash of the loaded document for a different page', () => {
    loadedDocument(`${ORIGIN}/en/stay#hours`);

    render(<PwaManager />);

    expect(cachePageMessages()).toEqual([]);
  });

  it('posts nothing on mount when the browser reports no navigation entry', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);

    render(<PwaManager />);

    expect(cachePageMessages()).toEqual([]);
  });

  describe('when no worker controls the page at mount (first visit)', () => {
    beforeEach(() => {
      container.controller = null;
    });

    it('posts the current page once, after the worker took control', () => {
      render(<PwaManager />);
      expect(cachePageMessages()).toEqual([]);

      window.history.pushState({}, '', '/en/phones');
      container.controller = worker;
      container.dispatchEvent(new Event('controllerchange'));
      expect(cachePageMessages()).toEqual([{ type: 'CACHE_PAGE', url: `${ORIGIN}/en/phones` }]);

      // A later change of the controller (a worker update) is not a new page.
      container.dispatchEvent(new Event('controllerchange'));
      expect(cachePageMessages()).toHaveLength(1);
    });

    it('posts nothing for a pathname change while there is still no controller', () => {
      const { rerender } = render(<PwaManager />);

      softNavigate('/en/moments', () => rerender(<PwaManager />));

      expect(cachePageMessages()).toEqual([]);
    });

    it('stops waiting for the controller when it unmounts', () => {
      const { unmount } = render(<PwaManager />);
      unmount();

      container.controller = worker;
      container.dispatchEvent(new Event('controllerchange'));

      expect(cachePageMessages()).toEqual([]);
    });
  });

  it('does not post in development, where the worker is unregistered', () => {
    vi.stubEnv('NEXT_PUBLIC_FORCE_SW_DEV', '');
    vi.stubGlobal('caches', { keys: vi.fn(async () => []), delete: vi.fn() });
    const { rerender } = render(<PwaManager />);

    softNavigate('/en/moments', () => rerender(<PwaManager />));

    expect(container.getRegistrations).toHaveBeenCalled();
    expect(cachePageMessages()).toEqual([]);
  });

  it('does not throw when the browser denies service workers', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      get() { throw new DOMException('Access to service workers is denied in this document.', 'SecurityError'); },
    });

    const { rerender } = render(<PwaManager />);

    expect(() => softNavigate('/en/moments', () => rerender(<PwaManager />))).not.toThrow();
  });
});
