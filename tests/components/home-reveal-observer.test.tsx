// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FactCounters from '@/components/home/FactCounters';
import HomeRevealObserver from '@/components/home/HomeRevealObserver';

type Entry = Pick<IntersectionObserverEntry, 'target' | 'isIntersecting'>;
type Callback = (entries: Entry[], observer: unknown) => void;
type Observation = {
  options: IntersectionObserverInit | undefined;
  targets: Element[];
  unobserved: Element[];
  disconnected: boolean;
  report: (entries: Entry[]) => void;
};

/** A controllable IntersectionObserver: it records its options, targets and calls, and the test reports which targets intersect. */
function stubObserver() {
  const observations: Observation[] = [];
  vi.stubGlobal('IntersectionObserver', class {
    private readonly observation: Observation;
    constructor(callback: Callback, options?: IntersectionObserverInit) {
      this.observation = {
        options,
        targets: [],
        unobserved: [],
        disconnected: false,
        report: (entries) => callback(entries, this),
      };
      observations.push(this.observation);
    }
    observe(target: Element) { this.observation.targets.push(target); }
    unobserve(target: Element) { this.observation.unobserved.push(target); }
    disconnect() { this.observation.disconnected = true; }
  });
  return observations;
}

describe('HomeRevealObserver trigger (R-379)', () => {
  it('reveals by a share of the viewport, not of the element: a rootMargin and no threshold', () => {
    const observations = stubObserver();
    render(
      <>
        <div data-reveal />
        <HomeRevealObserver />
      </>,
    );

    expect(observations).toHaveLength(1);
    // A threshold is a share of the element's own area, which an element taller than innerHeight / threshold never reaches.
    expect(observations[0].options).toStrictEqual({ rootMargin: '0px 0px -35% 0px' });
  });

  it('gives data-reveal="0.45" an observer of its own and lets equal shares share one', () => {
    const observations = stubObserver();
    render(
      <>
        <div data-reveal id="first" />
        <div data-reveal="0.45" id="window" />
        <div data-reveal id="second" />
        <HomeRevealObserver />
      </>,
    );

    expect(observations.map(({ options }) => options)).toStrictEqual([
      { rootMargin: '0px 0px -35% 0px' },
      { rootMargin: '0px 0px -45% 0px' },
    ]);
    expect(observations.map(({ targets }) => targets.map((target) => target.id))).toStrictEqual([['first', 'second'], ['window']]);
  });

  it('adds is-in once the target intersects and then stops observing it', () => {
    const observations = stubObserver();
    const { container } = render(
      <>
        <div data-reveal id="first" />
        <div data-reveal id="second" />
        <HomeRevealObserver />
      </>,
    );
    const first = container.querySelector('#first') as HTMLElement;
    const second = container.querySelector('#second') as HTMLElement;
    const [observation] = observations;

    observation.report([{ target: first, isIntersecting: false }]);
    expect(first).not.toHaveClass('is-in');
    expect(observation.unobserved).toStrictEqual([]);

    observation.report([{ target: first, isIntersecting: true }]);
    expect(first).toHaveClass('is-in');
    expect(observation.unobserved).toStrictEqual([first]);
    expect(second).not.toHaveClass('is-in');
  });

  it('marks every target in view where IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(
      <>
        <div data-reveal />
        <div data-reveal="0.45" />
        <HomeRevealObserver />
      </>,
    );

    const revealed = Array.from(container.querySelectorAll('[data-reveal]'), (target) => target.classList.contains('is-in'));
    expect(revealed).toStrictEqual([true, true]);
  });

  it('disconnects its observers when it unmounts', () => {
    const observations = stubObserver();
    const { unmount } = render(
      <>
        <div data-reveal />
        <div data-reveal="0.45" />
        <HomeRevealObserver />
      </>,
    );
    expect(observations.map(({ disconnected }) => disconnected)).toStrictEqual([false, false]);

    unmount();

    expect(observations.map(({ disconnected }) => disconnected)).toStrictEqual([true, true]);
  });
});

describe('FactCounters trigger (R-379)', () => {
  afterEach(() => document.documentElement.removeAttribute('data-motion'));

  it('counts on the same viewport share as the louvres, so the numbers start with them', () => {
    document.documentElement.setAttribute('data-motion', 'full');
    const observations = stubObserver();
    const { container } = render(
      <section className="facts" data-reveal>
        <FactCounters />
      </section>,
    );

    expect(observations).toHaveLength(1);
    expect(observations[0].options).toStrictEqual({ rootMargin: '0px 0px -35% 0px' });
    expect(observations[0].targets).toStrictEqual([container.querySelector('.facts')]);
  });
});
