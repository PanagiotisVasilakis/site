// @vitest-environment jsdom

import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/** A controllable requestAnimationFrame: a queue the test flushes by hand, so it decides when a frame runs. */
function stubFrames() {
  const queue = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  let lastId = 0;
  let executed = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    lastId += 1;
    queue.set(lastId, callback);
    return lastId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelled.push(id);
    queue.delete(id);
  });
  return {
    cancelled,
    executed: () => executed,
    pending: () => Array.from(queue.keys()),
    /** Runs the frames queued so far; a frame requested while they run waits for the next flush. */
    flush: (now = 1000) => {
      const due = Array.from(queue.values());
      queue.clear();
      for (const callback of due) {
        executed += 1;
        callback(now);
      }
    },
  };
}

/** jsdom lays nothing out (every rect is zero, top 0 < innerHeight): a target sits below the viewport unless a test places it. */
const tops = new WeakMap<Element, number>();
function placeAt(element: Element, top: number) {
  tops.set(element, top);
}

let frames: ReturnType<typeof stubFrames>;
let rectSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  frames = stubFrames();
  rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: Element) {
    const top = tops.get(this) ?? window.innerHeight + 200;
    return { x: 0, y: 0, width: 0, height: 0, top, bottom: top + 100, left: 0, right: 0, toJSON: () => ({}) };
  });
});

afterEach(() => {
  rectSpy.mockRestore();
  document.documentElement.removeAttribute('data-reveal-ready');
});

describe('HomeRevealObserver hydration flag (R-633)', () => {
  const root = document.documentElement;

  it('sets data-reveal-ready on <html> when it mounts, so the boot script failsafe sees that this page hydrated', () => {
    stubObserver();
    expect(root.hasAttribute('data-reveal-ready')).toBe(false);

    render(
      <>
        <div data-reveal />
        <HomeRevealObserver />
      </>,
    );

    expect(root.hasAttribute('data-reveal-ready')).toBe(true);
  });
});

describe('HomeRevealObserver trigger (R-379)', () => {
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
    expect(document.documentElement.hasAttribute('data-reveal-ready')).toBe(false);
    const { container } = render(
      <>
        <div data-reveal />
        <div data-reveal="0.45" />
        <HomeRevealObserver />
      </>,
    );

    expect(document.documentElement.hasAttribute('data-reveal-ready')).toBe(true);
    const revealed = Array.from(container.querySelectorAll('[data-reveal]'), (target) => target.classList.contains('is-in'));
    expect(revealed).toStrictEqual([true, true]);
  });
});

describe('HomeRevealObserver load-time reveal', () => {
  it('reveals a target already on screen after the second frame, without an intersection report, and leaves one below the viewport observed', () => {
    const observations = stubObserver();
    const { container } = render(
      <>
        <div data-reveal id="onscreen" />
        <div data-reveal id="below" />
        <HomeRevealObserver />
      </>,
    );
    const onscreen = container.querySelector('#onscreen') as HTMLElement;
    const below = container.querySelector('#below') as HTMLElement;
    placeAt(onscreen, 100);
    const [observation] = observations;

    // The hidden state is painted first, so the M6/M8 transitions still play.
    expect(onscreen).not.toHaveClass('is-in');

    // The first frame runs before the next paint: it only schedules the second.
    frames.flush();
    expect(onscreen).not.toHaveClass('is-in');
    expect(observation.unobserved).toStrictEqual([]);
    expect(frames.pending()).toHaveLength(1);

    frames.flush();

    expect(onscreen).toHaveClass('is-in');
    expect(observation.unobserved).toStrictEqual([onscreen]);
    expect(below).not.toHaveClass('is-in');
    expect(observation.disconnected).toBe(false);
  });

  it('cancels the second frame when it unmounts between the two frames, so nothing is revealed afterwards', () => {
    const observations = stubObserver();
    const { container, unmount } = render(
      <>
        <div data-reveal id="onscreen" />
        <HomeRevealObserver />
      </>,
    );
    const onscreen = container.querySelector('#onscreen') as HTMLElement;
    placeAt(onscreen, 100);

    frames.flush();
    expect(onscreen).not.toHaveClass('is-in');
    expect(frames.pending()).toHaveLength(1);
    const [second] = frames.pending();

    unmount();
    expect(frames.cancelled).toContain(second);
    expect(frames.pending()).toHaveLength(0);
    frames.flush();

    expect(onscreen).not.toHaveClass('is-in');
    expect(observations[0].unobserved).toStrictEqual([]);
  });
});

describe('HomeRevealObserver after a viewport change (R-685)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  /** Mounts one target below the viewport, runs both load frames (it stays hidden), then moves it into the bottom 35 % band, which no intersection report covers. */
  function mountBelowThenGrow(wrap: (children: ReactNode) => ReactNode = (children) => children) {
    const observations = stubObserver();
    const view = render(
      <>
        {wrap(
          <>
            <div data-reveal id="band" />
            <HomeRevealObserver />
          </>,
        )}
      </>,
    );
    const band = view.container.querySelector('#band') as HTMLElement;
    frames.flush();
    frames.flush();
    expect(band).not.toHaveClass('is-in');
    placeAt(band, window.innerHeight * 0.8);
    return { ...view, observations, band };
  }

  it('reveals a target that the viewport growth left in the bottom 35 %, after a debounced window resize, and unobserves it', () => {
    const { observations, band } = mountBelowThenGrow();

    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    expect(band).not.toHaveClass('is-in');
    vi.advanceTimersByTime(500);

    expect(band).toHaveClass('is-in');
    expect(observations[0].unobserved).toStrictEqual([band]);
  });

  it('stops listening and drops a pending pass when it unmounts', () => {
    const viewport = new EventTarget();
    vi.stubGlobal('visualViewport', viewport);
    const { observations, band, unmount } = mountBelowThenGrow();

    window.dispatchEvent(new Event('resize'));
    unmount();
    window.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(500);

    expect(band).not.toHaveClass('is-in');
    expect(observations[0].unobserved).toStrictEqual([]);
  });
});

describe('FactCounters load-time count', () => {
  afterEach(() => document.documentElement.removeAttribute('data-motion'));

  function renderStrip() {
    document.documentElement.setAttribute('data-motion', 'full');
    const observations = stubObserver();
    const view = render(
      <section className="facts" data-reveal>
        <span className="fact__num">90</span>
        <span className="fact__num">4</span>
        <span className="fact__num fact__num--sign">P</span>
        <FactCounters />
      </section>,
    );
    const strip = view.container.querySelector('.facts') as HTMLElement;
    const numbers = () => Array.from(strip.querySelectorAll('.fact__num:not(.fact__num--sign)'), (element) => element.textContent);
    return { ...view, observations, strip, numbers };
  }

  it('starts counting after the second frame when the strip is on screen at mount, with no intersection report, and ends on the server text', () => {
    const { strip, numbers } = renderStrip();
    placeAt(strip, 100);
    expect(numbers()).toStrictEqual(['90', '4']);

    // The first frame runs before the next paint: it only schedules the second, which starts the count.
    frames.flush(1000);
    expect(numbers()).toStrictEqual(['90', '4']);
    expect(frames.pending()).toHaveLength(1);

    // The count has started (its step is queued) but has not rewritten a digit yet.
    frames.flush(1000);
    expect(numbers()).toStrictEqual(['90', '4']);
    expect(frames.pending()).toHaveLength(1);

    frames.flush(1000);
    const [first, second] = numbers();
    expect(first).not.toBe('90');
    expect(second).not.toBe('4');

    frames.flush(1100);
    const [early, earlySecond] = numbers();
    expect(early).not.toBe('90');
    expect(earlySecond).not.toBe('4');

    frames.flush(3000);
    expect(numbers()).toStrictEqual(['90', '4']);
    expect(frames.pending()).toHaveLength(0);
  });

  it('leaves a strip below the viewport alone until an intersection report', () => {
    const { observations, strip, numbers } = renderStrip();

    frames.flush(1000);
    expect(frames.executed()).toBe(1);
    expect(frames.pending()).toHaveLength(1);
    expect(numbers()).toStrictEqual(['90', '4']);

    frames.flush(1000);
    expect(frames.executed()).toBe(2);
    expect(numbers()).toStrictEqual(['90', '4']);
    expect(frames.pending()).toHaveLength(0);

    observations[0].report([{ target: strip, isIntersecting: false }]);
    frames.flush(1000);
    expect(numbers()).toStrictEqual(['90', '4']);

    observations[0].report([{ target: strip, isIntersecting: true }]);
    frames.flush(1000);
    frames.flush(1100);
    expect(numbers()[0]).not.toBe('90');
    expect(numbers()[1]).not.toBe('4');

    frames.flush(3000);
    expect(numbers()).toStrictEqual(['90', '4']);
  });
});

describe('FactCounters after a viewport change (R-685)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-motion');
  });

  function renderGrown() {
    document.documentElement.setAttribute('data-motion', 'full');
    stubObserver();
    const view = render(
      <section className="facts" data-reveal>
        <span className="fact__num">90</span>
        <span className="fact__num">4</span>
        <FactCounters />
      </section>,
    );
    const strip = view.container.querySelector('.facts') as HTMLElement;
    const numbers = () => Array.from(strip.querySelectorAll('.fact__num'), (element) => element.textContent);
    frames.flush(1000);
    frames.flush(1000);
    expect(frames.pending()).toHaveLength(0);
    placeAt(strip, window.innerHeight * 0.8);
    return { ...view, numbers };
  }

  it('starts counting after a debounced resize when the strip now sits in the bottom 35 %, and counts once', () => {
    const { numbers } = renderGrown();

    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    expect(frames.pending()).toHaveLength(0);
    vi.advanceTimersByTime(500);
    expect(frames.pending()).toHaveLength(1);

    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(500);
    expect(frames.pending()).toHaveLength(1);

    frames.flush(1000);
    frames.flush(1100);
    expect(numbers()[0]).not.toBe('90');
    frames.flush(3000);
    expect(numbers()).toStrictEqual(['90', '4']);
    expect(frames.pending()).toHaveLength(0);
  });
});
