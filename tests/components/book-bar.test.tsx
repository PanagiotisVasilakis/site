// @vitest-environment jsdom

import type React from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

import BookBar from '@/components/shell/BookBar';

type Callback = (entries: Array<Pick<IntersectionObserverEntry, 'target' | 'isIntersecting'>>) => void;

/** A controllable IntersectionObserver: the test reports which observed elements are in view. */
function stubObserver() {
  const observers: Array<{ callback: Callback; targets: Element[] }> = [];
  vi.stubGlobal('IntersectionObserver', class {
    private entry: { callback: Callback; targets: Element[] };
    constructor(callback: Callback) {
      this.entry = { callback, targets: [] };
      observers.push(this.entry);
    }
    observe(target: Element) { this.entry.targets.push(target); }
    unobserve() {}
    disconnect() { this.entry.targets = []; }
  });
  return {
    report(inView: Map<Element, boolean>) {
      act(() => {
        for (const { callback, targets } of observers) {
          callback(targets.filter((target) => inView.has(target)).map((target) => ({ target, isIntersecting: inView.get(target) ?? false })));
        }
      });
    },
  };
}

function renderPage(note: string | null = 'Free tonight') {
  return render(
    <>
      <section data-hero>Hero</section>
      <p data-cta-watch>See free dates</p>
      <div data-cta-watch>Contact actions</div>
      <BookBar note={note} href="/en/availability" ctaLabel="Check dates" />
    </>,
  );
}

const shown = (bar: Element | null) => Boolean(bar?.classList.contains('is-shown')) && !bar?.hasAttribute('inert');

describe('BookBar visibility (identity §8)', () => {
  it('stays hidden while the hero is in view, shows once it has left, and hides again while a booking CTA is visible', () => {
    const io = stubObserver();
    const { container } = renderPage();
    const bar = container.querySelector('.bookbar');
    const [hero, cta1, cta2] = Array.from(container.querySelectorAll('[data-hero], [data-cta-watch]'));

    expect(shown(bar)).toBe(false);
    expect(bar).toHaveAttribute('inert');

    io.report(new Map([[hero, true], [cta1, false], [cta2, false]]));
    expect(shown(bar)).toBe(false);

    io.report(new Map([[hero, false]]));
    expect(shown(bar)).toBe(true);
    expect(bar).toHaveTextContent('Free tonight');

    io.report(new Map([[cta2, true]]));
    expect(shown(bar)).toBe(false);

    io.report(new Map([[cta2, false], [cta1, true]]));
    expect(shown(bar)).toBe(false);

    io.report(new Map([[cta1, false]]));
    expect(shown(bar)).toBe(true);

    io.report(new Map([[hero, true]]));
    expect(shown(bar)).toBe(false);
  });

  it('renders nothing without a note', () => {
    stubObserver();
    const { container } = renderPage(null);

    expect(container.querySelector('.bookbar')).toBeNull();
  });

  it('never shows without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = renderPage();

    expect(shown(container.querySelector('.bookbar'))).toBe(false);
  });
});

// PS-07: shell.css keeps the network dot beside the shown bar and the PWA pills above it from the bar's height, which wraps
// at larger text sizes, so the bar publishes it.
describe('BookBar height (PS-07)', () => {
  const published = () => document.documentElement.style.getPropertyValue('--bookbar-h');

  function stubResizeObserver() {
    const callbacks: Array<() => void> = [];
    let disconnects = 0;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { callbacks.push(callback); }
      observe() {}
      disconnect() { disconnects += 1; }
    });
    return { notify: () => callbacks.forEach((callback) => callback()), disconnects: () => disconnects };
  }

  it('publishes its height as --bookbar-h, follows a resize and removes it on unmount', () => {
    stubObserver();
    const ro = stubResizeObserver();
    let height = 58;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect);
    const { unmount } = renderPage();
    expect(published()).toBe('58px');

    // A larger text size wraps the note onto more lines.
    height = 96.4;
    act(() => ro.notify());
    expect(published()).toBe('97px');

    unmount();
    expect(published()).toBe('');
    expect(ro.disconnects()).toBeGreaterThan(0);
  });

  it('publishes nothing without a bar', () => {
    stubObserver();
    stubResizeObserver();
    renderPage(null);

    expect(published()).toBe('');
  });

  it('publishes nothing without ResizeObserver; the stylesheet falls back to the one-line height', () => {
    stubObserver();
    vi.stubGlobal('ResizeObserver', undefined);
    renderPage();

    expect(published()).toBe('');
  });
});
