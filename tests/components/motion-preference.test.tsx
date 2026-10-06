// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMotionPreference } from '@/lib/motion/motionPreference';

type Listener = () => void;

function installReducedMotion(initialReduce: boolean) {
  let reduce = initialReduce;
  const listeners = new Set<Listener>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      if (query === '(prefers-reduced-motion: reduce)') return reduce;
      if (query === '(prefers-reduced-motion: no-preference)') return !reduce;
      return false;
    },
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  }));
  return {
    listenerCount: () => listeners.size,
    setReduce(value: boolean) {
      reduce = value;
      listeners.forEach((listener) => listener());
    },
  };
}

const root = document.documentElement;

describe('motionPreference (identity §5.2)', () => {
  beforeEach(() => {
    localStorage.clear();
    root.removeAttribute('data-motion');
  });

  it('follows an OS reduced-motion change live', () => {
    const media = installReducedMotion(false);
    renderHook(() => useMotionPreference());
    expect(root.getAttribute('data-motion')).toBe('full');
    act(() => media.setReduce(true));
    expect(root.hasAttribute('data-motion')).toBe(false);
    act(() => media.setReduce(false));
    expect(root.getAttribute('data-motion')).toBe('full');
  });

  it('keeps a stored reduce choice regardless of the OS setting', () => {
    const media = installReducedMotion(false);
    localStorage.setItem('motion', 'reduce');
    renderHook(() => useMotionPreference());
    expect(root.getAttribute('data-motion')).toBe('reduce');
    act(() => media.setReduce(true));
    expect(root.getAttribute('data-motion')).toBe('reduce');
  });

  it('reacts to the stored motion key changing in another tab', () => {
    installReducedMotion(false);
    renderHook(() => useMotionPreference());
    localStorage.setItem('motion', 'reduce');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'motion', newValue: 'reduce' })));
    expect(root.getAttribute('data-motion')).toBe('reduce');
    localStorage.removeItem('motion');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'motion', newValue: null })));
    expect(root.getAttribute('data-motion')).toBe('full');
  });

  it('treats blocked storage as no stored choice', () => {
    installReducedMotion(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    renderHook(() => useMotionPreference());
    expect(root.getAttribute('data-motion')).toBe('full');
  });

  it('removes its listeners on unmount', () => {
    const media = installReducedMotion(false);
    const { unmount } = renderHook(() => useMotionPreference());
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
    localStorage.setItem('motion', 'reduce');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'motion', newValue: 'reduce' })));
    expect(root.getAttribute('data-motion')).toBe('full');
  });
});
