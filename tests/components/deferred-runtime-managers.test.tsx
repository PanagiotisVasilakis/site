// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/PwaManager', () => ({ default: () => <p>pwa manager mounted</p> }));

import DeferredRuntimeManagers from '@/components/DeferredRuntimeManagers';

describe('DeferredRuntimeManagers', () => {
  let idleCallbacks: Array<() => void>;
  let requestIdleCallback: ReturnType<typeof vi.fn>;
  let cancelIdleCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    idleCallbacks = [];
    requestIdleCallback = vi.fn((callback: () => void) => {
      idleCallbacks.push(callback);
      return 7;
    });
    cancelIdleCallback = vi.fn();
    Object.defineProperty(window, 'requestIdleCallback', { value: requestIdleCallback, configurable: true });
    Object.defineProperty(window, 'cancelIdleCallback', { value: cancelIdleCallback, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'requestIdleCallback');
    Reflect.deleteProperty(window, 'cancelIdleCallback');
  });

  it('mounts PwaManager only after the page is idle', async () => {
    render(<DeferredRuntimeManagers />);
    act(() => {
      window.dispatchEvent(new Event('load'));
    });

    expect(screen.queryByText('pwa manager mounted')).not.toBeInTheDocument();
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2500 });

    expect(idleCallbacks).toHaveLength(1);
    act(() => {
      idleCallbacks[0]();
    });
    expect(await screen.findByText('pwa manager mounted')).toBeInTheDocument();
  });

  it('cancels the idle callback on unmount', () => {
    const { unmount } = render(<DeferredRuntimeManagers />);
    act(() => {
      window.dispatchEvent(new Event('load'));
    });

    unmount();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });
});
