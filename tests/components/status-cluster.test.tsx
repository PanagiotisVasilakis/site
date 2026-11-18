// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StatusCluster from '@/components/StatusCluster';
import { stubMatchMedia } from '../support/dom';

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

  it('does not poll continuously on idle tabs or desktop viewports', async () => {
    stubMatchMedia(true);
    const desktop = render(<StatusCluster labels={labels} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetchSpy).not.toHaveBeenCalled();
    desktop.unmount();

    stubMatchMedia(false);
    render(<StatusCluster labels={labels} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('probes on mobile when returning online or after a long idle visibility return', async () => {
    stubMatchMedia(false);
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
    stubMatchMedia(false);
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

  it('renders net-status markup matching stay.css classes and accessible status attributes', () => {
    stubMatchMedia(false);
    const { container, getByRole } = render(<StatusCluster labels={labels} />);
    const status = getByRole('status');
    expect(status.tagName).toBe('SPAN');
    expect(status).toHaveClass('net-status');
    expect(status).toHaveAttribute('data-state', 'online');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-label', 'Online.');
    expect(status).toHaveAttribute('title', 'Online.');
    expect(container.querySelector('.net-status-dot')).toHaveAttribute('aria-hidden');
    expect(container.querySelector('.net-status__label')?.textContent).toBe('Online');
  });
});
