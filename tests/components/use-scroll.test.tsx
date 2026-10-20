// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useScroll } from '@/hooks/useScroll';

function scrollTo(y: number) {
  vi.stubGlobal('scrollY', y);
  act(() => { window.dispatchEvent(new Event('scroll')); });
}

describe('useScroll', () => {
  it('reports scrolled at mount when the restored offset is above the threshold', () => {
    vi.stubGlobal('scrollY', 600);
    const { result } = renderHook(() => useScroll(24));
    expect(result.current.scrolled).toBe(true);
  });

  it('reports not scrolled at mount when the offset equals the threshold', () => {
    vi.stubGlobal('scrollY', 24);
    const { result } = renderHook(() => useScroll(24));
    expect(result.current.scrolled).toBe(false);
  });

  it('follows scroll events after mount', () => {
    vi.stubGlobal('scrollY', 0);
    const { result } = renderHook(() => useScroll(24));
    expect(result.current.scrolled).toBe(false);

    scrollTo(100);
    expect(result.current.scrolled).toBe(true);

    scrollTo(0);
    expect(result.current.scrolled).toBe(false);
  });
});
