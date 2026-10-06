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

function renderPage(price: string | null = '€85') {
  return render(
    <>
      <section data-hero>Hero</section>
      <p data-cta-watch>See free dates</p>
      <div data-cta-watch>Contact actions</div>
      <BookBar fromText="from {price} / night" price={price} note="Free tonight" href="/en/availability" ctaLabel="Check dates" />
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
    expect(bar).toHaveTextContent('from €85 / nightFree tonight');

    io.report(new Map([[cta2, true]]));
    expect(shown(bar)).toBe(false);

    io.report(new Map([[cta2, false], [cta1, true]]));
    expect(shown(bar)).toBe(false);

    io.report(new Map([[cta1, false]]));
    expect(shown(bar)).toBe(true);

    io.report(new Map([[hero, true]]));
    expect(shown(bar)).toBe(false);
  });

  it('renders nothing without price data', () => {
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
