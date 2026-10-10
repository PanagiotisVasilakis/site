// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }));
vi.mock('@/lib/logger-client', () => ({ logger }));

import PwaManager from '@/components/PwaManager';

type FakeRegistration = {
  waiting: { postMessage: ReturnType<typeof vi.fn> } | null;
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
    controller: null;
    register: ReturnType<typeof vi.fn>;
    getRegistration: ReturnType<typeof vi.fn>;
    getRegistrations: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
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

  function runtimeVersionMessage(version: string, build: string): MessageEvent {
    return { data: { type: 'RUNTIME_VERSION', meta: { version, build } } } as MessageEvent;
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
      render(<ShellWithPwaManager />);
      const onMessage = workerMessageListener();

      expect(() => onMessage(runtimeVersionMessage('1.2.3', 'abcdef0123456789'))).not.toThrow();
    });

    it('shows the update banner for a new worker version although the dismissed version cannot be read', () => {
      // Only the lookup of the dismissed version is denied here; the stored version is still readable.
      vi.mocked(Storage.prototype.getItem).mockImplementation((key: string) => {
        if (key === 'app-version') return '1.0.0';
        if (key === 'app-build') return 'oldbuild0123';
        throw new DOMException('blocked', 'SecurityError');
      });
      render(<ShellWithPwaManager />);

      workerMessageListener()(runtimeVersionMessage('2.0.0', 'newbuild0123'));
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
      render(<ShellWithPwaManager />);
      const onMessage = workerMessageListener();
      const banner = element('update-banner');

      onMessage(runtimeVersionMessage('1.0.0', 'oldbuild0123'));
      expect(localStorage.getItem('app-version')).toBe('1.0.0');
      expect(localStorage.getItem('app-build')).toBe('oldbuild0123');
      expect(banner.style.display).toBe('');

      onMessage(runtimeVersionMessage('2.0.0', 'newbuild0123'));
      expect(banner.style.display).toBe('flex');
      expect(banner).toHaveTextContent('Update available: 1.0.0 → 2.0.0');

      fireEvent.click(element('update-dismiss-btn'));
      expect(banner.style.display).toBe('none');
      expect(localStorage.getItem('update-dismissed-version')).toBe('2.0.0:newbuild0123');

      onMessage(runtimeVersionMessage('2.0.0', 'newbuild0123'));
      expect(banner.style.display).toBe('none');
    });
  });
});
