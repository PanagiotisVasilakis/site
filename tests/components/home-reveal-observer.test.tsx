// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
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

  it('sets the flag without IntersectionObserver too', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
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

  it('also reveals a target already above the viewport (a restored scroll position)', () => {
    const observations = stubObserver();
    const { container } = render(
      <>
        <div data-reveal id="above" />
        <HomeRevealObserver />
      </>,
    );
    const above = container.querySelector('#above') as HTMLElement;
    placeAt(above, -400);

    frames.flush();
    expect(above).not.toHaveClass('is-in');

    frames.flush();

    expect(above).toHaveClass('is-in');
    expect(observations[0].unobserved).toStrictEqual([above]);
  });

  it('unobserves a revealed target from the observer that owns its share', () => {
    const observations = stubObserver();
    const { container } = render(
      <>
        <div data-reveal id="first" />
        <div data-reveal="0.45" id="window" />
        <HomeRevealObserver />
      </>,
    );
    const first = container.querySelector('#first') as HTMLElement;
    const windowTarget = container.querySelector('#window') as HTMLElement;
    placeAt(first, 100);
    placeAt(windowTarget, 120);

    frames.flush();
    expect(observations.map(({ unobserved }) => unobserved)).toStrictEqual([[], []]);

    frames.flush();

    expect(observations.map(({ unobserved }) => unobserved)).toStrictEqual([[first], [windowTarget]]);
  });

  it('cancels the load-time frame when it unmounts first, so nothing is revealed afterwards', () => {
    stubObserver();
    const { container, unmount } = render(
      <>
        <div data-reveal id="onscreen" />
        <HomeRevealObserver />
      </>,
    );
    const onscreen = container.querySelector('#onscreen') as HTMLElement;
    placeAt(onscreen, 100);
    expect(frames.pending()).toHaveLength(1);
    const [scheduled] = frames.pending();

    unmount();
    expect(frames.cancelled).toContain(scheduled);
    frames.flush();

    expect(onscreen).not.toHaveClass('is-in');
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

  it('leaves a target that is already revealed alone: the frames skip it and do not unobserve it again', () => {
    const observations = stubObserver();
    const { container } = render(
      <>
        <div data-reveal id="reported" />
        <div className="is-in" data-reveal id="served" />
        <HomeRevealObserver />
      </>,
    );
    const reported = container.querySelector('#reported') as HTMLElement;
    const served = container.querySelector('#served') as HTMLElement;
    placeAt(reported, 100);
    placeAt(served, 100);
    const [observation] = observations;
    // The server markup already carries is-in on one target, so it is never observed.
    expect(observation.targets).toStrictEqual([reported]);

    // An intersection report reveals the other one before the frames run.
    observation.report([{ target: reported, isIntersecting: true }]);
    expect(reported).toHaveClass('is-in');
    expect(observation.unobserved).toStrictEqual([reported]);

    expect(() => {
      frames.flush();
      frames.flush();
    }).not.toThrow();

    expect(reported).toHaveClass('is-in');
    expect(served).toHaveClass('is-in');
    expect(observation.unobserved).toStrictEqual([reported]);
    expect(frames.pending()).toHaveLength(0);
  });

  it('under StrictMode (effects run, clean up and run again) reveals the on-screen target once and keeps the one below observed', () => {
    const observations = stubObserver();
    const { container } = render(
      <StrictMode>
        <div data-reveal id="onscreen" />
        <div data-reveal id="below" />
        <HomeRevealObserver />
      </StrictMode>,
    );
    const onscreen = container.querySelector('#onscreen') as HTMLElement;
    const below = container.querySelector('#below') as HTMLElement;
    placeAt(onscreen, 100);

    // The first run is cleaned up: its observer is disconnected and its pending frame cancelled.
    expect(observations).toHaveLength(2);
    expect(observations.map(({ disconnected }) => disconnected)).toStrictEqual([true, false]);
    expect(frames.cancelled).toHaveLength(1);
    expect(frames.pending()).toHaveLength(1);
    expect(frames.pending()).not.toContain(frames.cancelled[0]);

    frames.flush();
    expect(onscreen).not.toHaveClass('is-in');
    frames.flush();

    expect(onscreen).toHaveClass('is-in');
    expect(below).not.toHaveClass('is-in');
    expect(observations.map(({ unobserved }) => unobserved)).toStrictEqual([[], [onscreen]]);
    expect(observations[1].targets).toStrictEqual([onscreen, below]);
    expect(observations[1].disconnected).toBe(false);
    expect(frames.pending()).toHaveLength(0);
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

  it('reveals the same way on a visualViewport resize', () => {
    const viewport = new EventTarget();
    vi.stubGlobal('visualViewport', viewport);
    const { observations, band } = mountBelowThenGrow();

    viewport.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(500);

    expect(band).toHaveClass('is-in');
    expect(observations[0].unobserved).toStrictEqual([band]);
  });

  it('keeps a target below the viewport hidden and observed after a resize', () => {
    const { observations, band } = mountBelowThenGrow();
    placeAt(band, window.innerHeight + 50);

    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(500);

    expect(band).not.toHaveClass('is-in');
    expect(observations[0].unobserved).toStrictEqual([]);
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

  it('under StrictMode only the live effect run reveals on a resize', () => {
    const { observations, band } = mountBelowThenGrow((children) => <StrictMode>{children}</StrictMode>);

    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(500);

    expect(band).toHaveClass('is-in');
    expect(observations.map(({ unobserved }) => unobserved)).toStrictEqual([[], [band]]);
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

  it('cancels the load-time frame when it unmounts first, so no count starts afterwards', () => {
    const { strip, numbers, unmount } = renderStrip();
    placeAt(strip, 100);
    expect(frames.pending()).toHaveLength(1);
    const [scheduled] = frames.pending();

    unmount();
    expect(frames.cancelled).toContain(scheduled);
    frames.flush(1000);

    expect(frames.pending()).toHaveLength(0);
    expect(numbers()).toStrictEqual(['90', '4']);
  });

  it('cancels the second frame when it unmounts between the two frames, so no count starts afterwards', () => {
    const { observations, strip, numbers, unmount } = renderStrip();
    placeAt(strip, 100);

    frames.flush(1000);
    expect(frames.pending()).toHaveLength(1);
    const [second] = frames.pending();

    unmount();
    expect(frames.cancelled).toContain(second);
    expect(frames.pending()).toHaveLength(0);
    frames.flush(1000);

    expect(frames.executed()).toBe(1);
    expect(frames.pending()).toHaveLength(0);
    expect(numbers()).toStrictEqual(['90', '4']);
    expect(observations[0].disconnected).toBe(true);
  });

  it('under StrictMode (effects run, clean up and run again) starts the count once and ends on the server text', () => {
    document.documentElement.setAttribute('data-motion', 'full');
    const observations = stubObserver();
    const { container } = render(
      <StrictMode>
        <section className="facts" data-reveal>
          <span className="fact__num">90</span>
          <span className="fact__num">4</span>
          <FactCounters />
        </section>
      </StrictMode>,
    );
    const strip = container.querySelector('.facts') as HTMLElement;
    const numbers = () => Array.from(strip.querySelectorAll('.fact__num'), (element) => element.textContent);
    placeAt(strip, 100);

    // The first run is cleaned up: its observer is disconnected and its pending load frame cancelled.
    expect(observations).toHaveLength(2);
    expect(observations.map(({ disconnected }) => disconnected)).toStrictEqual([true, false]);
    // (The cleanup also passes its idle count-frame id 0 to cancelAnimationFrame, a no-op: only real ids are counted.)
    expect(frames.cancelled.filter((id) => id > 0)).toHaveLength(1);
    expect(frames.pending()).toHaveLength(1);
    expect(frames.cancelled).not.toContain(frames.pending()[0]);
    expect(numbers()).toStrictEqual(['90', '4']);

    frames.flush(1000);
    expect(numbers()).toStrictEqual(['90', '4']);
    expect(frames.pending()).toHaveLength(1);

    // One count only: a single step frame is queued, the cancelled first run adds none.
    frames.flush(1000);
    expect(numbers()).toStrictEqual(['90', '4']);
    expect(frames.pending()).toHaveLength(1);
    expect(observations.map(({ disconnected }) => disconnected)).toStrictEqual([true, true]);

    frames.flush(1000);
    const [first, second] = numbers();
    expect(first).not.toBe('90');
    expect(second).not.toBe('4');
    expect(frames.pending()).toHaveLength(1);

    frames.flush(3000);
    expect(numbers()).toStrictEqual(['90', '4']);
    expect(frames.pending()).toHaveLength(0);
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

  it('starts on a visualViewport resize too', () => {
    const viewport = new EventTarget();
    vi.stubGlobal('visualViewport', viewport);
    renderGrown();

    viewport.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(500);

    expect(frames.pending()).toHaveLength(1);
  });

  it('does not start on a resize after it unmounts', () => {
    const { unmount } = renderGrown();

    window.dispatchEvent(new Event('resize'));
    unmount();
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(500);

    expect(frames.pending()).toHaveLength(0);
  });
});
