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
