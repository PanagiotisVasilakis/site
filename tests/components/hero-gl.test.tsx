// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HeroGlIsland from '@/components/home/hero/HeroGlIsland';
import { heroCover } from '@/components/home/hero/heroCover';
import { mountHeroGl } from '@/components/home/hero/heroGl';

const HERO_HTML = `<section class="hero" data-hero><div class="hero__stage"><div class="hero__media">
<picture><img class="hero__img" alt="" src="/house/balcony/hero/balcony-hero-3x2-1920.webp"></picture>
<div class="hero__tint"></div><div class="hero__scrim"></div></div></div></section>`;

function heroParts() {
  document.body.innerHTML = HERO_HTML;
  const hero = document.querySelector<HTMLElement>('[data-hero]')!;
  const img = hero.querySelector<HTMLImageElement>('.hero__img')!;
  // The photo never finishes decoding here, so the mounted canvas stays in its loading phase.
  img.decode = () => new Promise<void>(() => {});
  return { hero, img };
}

/** A WebGL stand-in: every method is a no-op, constants are 0, links succeed, no GL errors. */
function fakeWebGl() {
  const loseContext = vi.fn();
  const uniform4f = vi.fn();
  const gl = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'getExtension') return (name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null);
      if (prop === 'getProgramParameter') return () => true;
      if (prop === 'getError') return () => 0;
      if (prop === 'uniform4f') return uniform4f;
      if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return 0;
      return () => ({});
    },
  });
  return { gl: gl as WebGLRenderingContext, loseContext, uniform4f };
}

/**
 * Lets the photo decode and the depth map load (jsdom loads no images), so the canvas starts: the
 * photo shows the given crop at the given natural size, and the canvas box is 390 × 844.
 */
function startableHero(currentSrc: string, naturalWidth: number, naturalHeight: number) {
  const parts = heroParts();
  const photo = { currentSrc, naturalWidth, naturalHeight };
  parts.img.decode = () => Promise.resolve();
  for (const key of ['currentSrc', 'naturalWidth', 'naturalHeight'] as const) {
    Object.defineProperty(parts.img, key, { configurable: true, get: () => photo[key] });
  }
  vi.stubGlobal('Image', class {
    decoding = '';
    onload: (() => void) | null = null;
    setAttribute() {}
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  });
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  });
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(390);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(844);
  return { ...parts, photo };
}

const VSYNC_MS = 1000 / 60;

/**
 * A requestAnimationFrame that runs only when the test moves its clock on: every tick runs the callbacks
 * queued so far with the new time, so the test decides how far apart the frames are.
 */
function fakeRafClock() {
  let now = 0;
  let nextId = 0;
  let queue: Array<{ id: number; callback: FrameRequestCallback }> = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queue.push({ id: ++nextId, callback });
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue = queue.filter((entry) => entry.id !== id);
  });
  return {
    pending: () => queue.length,
    /** Runs `ms` of ticks, one every `step` ms (a 60 Hz display by default). */
    run(ms: number, step = VSYNC_MS) {
      const ticks = Math.round(ms / step);
      for (let tick = 0; tick < ticks; tick += 1) {
        now += step;
        const due = queue;
        queue = [];
        due.forEach(({ callback }) => callback(now));
      }
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.setAttribute('data-motion', 'full');
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-motion');
  document.body.innerHTML = '';
});

describe('mountHeroGl (identity §5.6)', () => {
  it('keeps the photo and records off:no-context when WebGL is unavailable (jsdom getContext is null)', () => {
    const { hero, img } = heroParts();

    mountHeroGl({ hero, img, depthSrc: '/house/balcony/hero/depth-3x2.webp' });

    expect(hero.dataset.gl).toBe('off:no-context');
    vi.advanceTimersByTime(700);
    expect(hero.querySelector('canvas')).toBeNull();
    expect(hero.querySelector('.hero__img')).toBe(img);
  });

  it('inserts an aria-hidden canvas under the tint and scrim', () => {
    const { hero, img } = heroParts();
    const { gl } = fakeWebGl();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl);

    mountHeroGl({ hero, img, depthSrc: '/house/balcony/hero/depth-3x2.webp' });

    const canvas = hero.querySelector('.hero__media > canvas.hero__gl');
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.nextElementSibling?.className).toBe('hero__tint');
    expect(hero.dataset.gl).toBeUndefined();
  });

  it('tears down when data-motion leaves "full": off:reduced-motion, context lost, canvas removed, photo kept', async () => {
    const { hero, img } = heroParts();
    const { gl, loseContext } = fakeWebGl();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl);
    mountHeroGl({ hero, img, depthSrc: '/house/balcony/hero/depth-3x2.webp' });

    document.documentElement.setAttribute('data-motion', 'reduce');
    await Promise.resolve(); // MutationObserver records are delivered as a microtask

    expect(hero.dataset.gl).toBe('off:reduced-motion');
    expect(hero.querySelector('canvas')).not.toBeNull(); // fading out
    vi.advanceTimersByTime(700);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(hero.querySelector('canvas')).toBeNull();
    expect(hero.querySelector('.hero__img')).toBe(img);
  });

  it('does not mount when motion is no longer armed at mount time', () => {
    const { hero, img } = heroParts();
    const { gl } = fakeWebGl();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl);
    document.documentElement.setAttribute('data-motion', 'reduce');

    mountHeroGl({ hero, img, depthSrc: '/house/balcony/hero/depth-3x2.webp' });

    expect(hero.dataset.gl).toBe('off:reduced-motion');
  });

  it('destroy() removes the canvas without recording a reason', () => {
    const { hero, img } = heroParts();
    const { gl, loseContext } = fakeWebGl();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl);

    mountHeroGl({ hero, img, depthSrc: '/house/balcony/hero/depth-3x2.webp' }).destroy();
    vi.advanceTimersByTime(700);

    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(hero.querySelector('canvas')).toBeNull();
    expect(hero.dataset.gl).toBeUndefined();
  });

  it('covers with the size of the uploaded crop, not the live img size', async () => {
    const { hero, img, photo } = startableHero('/house/balcony/hero/balcony-hero-9x16-720.avif', 720, 1280);
    const { gl, uniform4f } = fakeWebGl();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl);
    const handle = mountHeroGl({ hero, img, depthSrc: '/house/balcony/hero/depth-9x16.webp' });
    await vi.advanceTimersByTimeAsync(0);
    expect(uniform4f).toHaveBeenLastCalledWith(expect.anything(), ...heroCover(390, 844, 720, 1280, 0.5, 0.5));

    photo.naturalWidth = 1920;
    photo.naturalHeight = 1280;
    window.dispatchEvent(new Event('resize'));

    expect(uniform4f).toHaveBeenLastCalledWith(expect.anything(), ...heroCover(390, 844, 720, 1280, 0.5, 0.5));
    expect(hero.dataset.gl).toBeUndefined();
    handle.destroy();
  });

  it('tears down with off:crop-change when <picture> switches to another crop', async () => {
    const { hero, img, photo } = startableHero('/house/balcony/hero/balcony-hero-4x5-1024.avif', 1024, 1280);
    const { gl, loseContext } = fakeWebGl();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl);
    mountHeroGl({ hero, img, depthSrc: '/house/balcony/hero/depth-4x5.webp' });
    await vi.advanceTimersByTimeAsync(0);
    expect(hero.dataset.gl).toBeUndefined();

    photo.currentSrc = '/house/balcony/hero/balcony-hero-3x2-1440.avif';
    img.dispatchEvent(new Event('load'));

    expect(hero.dataset.gl).toBe('off:crop-change');
    vi.advanceTimersByTime(700);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(hero.querySelector('canvas')).toBeNull();
    expect(hero.querySelector('.hero__img')).toBe(img);
  });

  it('registers no listeners or observer when the crop already changed before start', async () => {
    const { hero, img } = startableHero('/house/balcony/hero/balcony-hero-3x2-1440.avif', 1440, 960);
    const { gl, loseContext } = fakeWebGl();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl);
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      observe = observe;
      disconnect() {}
    });
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const documentAdd = vi.spyOn(document, 'addEventListener');
    const imgAdd = vi.spyOn(img, 'addEventListener');
    const heroAdd = vi.spyOn(hero, 'addEventListener');

    mountHeroGl({ hero, img, depthSrc: '/house/balcony/hero/depth-4x5.webp' });
    await vi.advanceTimersByTimeAsync(0);

    expect(hero.dataset.gl).toBe('off:crop-change');
    expect(observe).not.toHaveBeenCalled();
    expect(windowAdd).not.toHaveBeenCalled();
    expect(documentAdd).not.toHaveBeenCalled();
    expect(imgAdd).not.toHaveBeenCalled();
    expect(heroAdd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(hero.querySelector('canvas')).toBeNull();
  });
});

describe('mountHeroGl slow-frame watchdog (identity §5.6, R-444)', () => {
  /** A started canvas on a stub context, a hand-driven frame clock and a switch for the hero's visibility. */
  async function runningHero() {
    const { hero, img } = startableHero('/house/balcony/hero/balcony-hero-3x2-1440.avif', 1440, 960);
    const { gl, loseContext } = fakeWebGl();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl);
    let report: IntersectionObserverCallback = () => {};
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { report = callback; }
      observe() {}
      disconnect() {}
    });
    const clock = fakeRafClock();
    const handle = mountHeroGl({ hero, img, depthSrc: '/house/balcony/hero/depth-3x2.webp' });
    await vi.advanceTimersByTimeAsync(0);
    const inView = (isIntersecting: boolean) => report([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
    return { hero, handle, loseContext, clock, inView };
  }

  it('keeps the effect on when input redraws come 300 ms apart after the ambient phase', async () => {
    const { hero, handle, clock } = await runningHero();
    clock.run(6000); // the ambient phase draws until t = 5 s, then the loop waits for input
    vi.advanceTimersByTime(700); // the canvas fade-in
    expect(hero.dataset.gl).toBe('on');
    expect(clock.pending()).toBe(0);

    for (let kick = 0; kick < 25; kick += 1) {
      window.dispatchEvent(new Event('scroll'));
      expect(clock.pending()).toBe(1); // the scroll woke the loop
      clock.run(300); // the kicked frame draws once, about 300 ms after the one before it
      expect(hero.dataset.gl).toBe('on');
    }

    handle.destroy();
  });

  it('does not count a pause while the hero is out of view as a slow frame', async () => {
    const { hero, handle, clock, inView } = await runningHero();
    clock.run(500); // frames run back to back inside the ambient phase
    vi.advanceTimersByTime(700);
    expect(hero.dataset.gl).toBe('on');

    for (let pause = 0; pause < 25; pause += 1) {
      inView(false);
      clock.run(VSYNC_MS); // the frame that was already queued finds the hero out of view and stops
      clock.run(100, 100); // 100 ms without a frame
      inView(true);
      clock.run(VSYNC_MS); // the first frame back measures the pause, not the GPU
      expect(hero.dataset.gl).toBe('on');
    }

    handle.destroy();
  });

  it('still tears down with off:slow-frames when a continuous run draws a frame every 100 ms', async () => {
    const { hero, loseContext, clock } = await runningHero();

    clock.run(2400, 100); // frames 1-6 do not count, then 18 slow ones: not torn down yet
    expect(hero.dataset.gl).toBeUndefined();
    clock.run(100, 100); // the 19th slow frame

    expect(hero.dataset.gl).toBe('off:slow-frames');
    vi.advanceTimersByTime(700);
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(hero.querySelector('canvas')).toBeNull();
  });
});

describe('HeroGlIsland', () => {
  it('runs the capability gate after load and idle, and records the abort reason', () => {
    const { hero } = heroParts();
    document.documentElement.setAttribute('data-motion', 'reduce');

    render(<HeroGlIsland />);
    expect(hero.dataset.gl).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(1200); // jsdom has no requestIdleCallback: the Safari fallback
    });

    expect(hero.dataset.gl).toBe('off:reduced-motion');
    expect(hero.querySelector('canvas')).toBeNull();
  });

  it('does nothing once unmounted before the idle callback', () => {
    const { hero } = heroParts();
    document.documentElement.setAttribute('data-motion', 'reduce');

    const { unmount } = render(<HeroGlIsland />);
    unmount();
    vi.advanceTimersByTime(1200);

    expect(hero.dataset.gl).toBeUndefined();
  });
});
