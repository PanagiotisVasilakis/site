// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
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
