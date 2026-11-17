// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StatusCluster from '@/components/StatusCluster';

const labels = {
  online: 'Online',
  offline: 'Offline',
  reconnecting: 'Reconnecting',
  slow: 'Slow',
};

describe('StatusCluster', () => {
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'onLine');
    Reflect.deleteProperty(document, 'hidden');
  });

  function setViewport(isDesktop: boolean) {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: isDesktop,
      media: '(min-width: 640px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  }

  it('does not poll continuously on idle tabs or desktop viewports', async () => {
    setViewport(true);
    const desktop = render(<StatusCluster labels={labels} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetchSpy).not.toHaveBeenCalled();
    desktop.unmount();

    setViewport(false);
    render(<StatusCluster labels={labels} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('probes on mobile when returning online or after a long idle visibility return', async () => {
    setViewport(false);
    render(<StatusCluster labels={labels} />);

    act(() => { window.dispatchEvent(new Event('online')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('aborts an in-flight probe on unmount', async () => {
    setViewport(false);
    let signal: AbortSignal | undefined;
    fetchSpy.mockImplementation((_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise(() => undefined);
    });

    const { unmount } = render(<StatusCluster labels={labels} />);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
