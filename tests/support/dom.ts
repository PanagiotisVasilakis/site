import { act } from '@testing-library/react';
import { vi } from 'vitest';

type ObserverCallback = (entries: Array<Pick<IntersectionObserverEntry, 'target' | 'isIntersecting'>>) => void;

/**
 * A controllable IntersectionObserver: each observer hears only about the elements it observes, and `report`
 * tells them which of those are in view.
 */
export function stubIntersectionObserver() {
  const observers: Array<{ callback: ObserverCallback; targets: Element[] }> = [];
  vi.stubGlobal('IntersectionObserver', class {
    private readonly entry: { callback: ObserverCallback; targets: Element[] };
    constructor(callback: ObserverCallback) {
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
          const entries = targets.filter((target) => inView.has(target)).map((target) => ({ target, isIntersecting: inView.get(target) ?? false }));
          if (entries.length > 0) callback(entries);
        }
      });
    },
  };
}

/** jsdom has no HTMLDialogElement.showModal/close; these follow the spec's observable steps (the `open` attribute and the `close` event). */
export function installDialogMethods() {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    }),
  });
}

export function removeDialogMethods() {
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
}

/** Every media query answers `matches`, and nothing listens for a change. */
export function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches,
    addEventListener() {},
    removeEventListener() {},
  }));
}
