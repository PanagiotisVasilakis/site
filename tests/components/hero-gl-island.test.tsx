// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mountHeroGl: vi.fn(), destroy: vi.fn() }));

vi.mock('@/components/home/hero/heroGl', () => ({ mountHeroGl: mocks.mountHeroGl }));

import HeroGlIsland from '@/components/home/hero/HeroGlIsland';

const HERO_HTML = `<section class="hero" data-hero><div class="hero__stage"><div class="hero__media">
<picture><img class="hero__img" alt="" src="/house/balcony/hero/balcony-hero-3x2-1920.webp"></picture>
<div class="hero__tint"></div><div class="hero__scrim"></div></div></div></section>`;

/** A hero that passes the capability gate; the browser chose `currentSrc` while `src` stays the 3:2 file. */
function capableHero(currentSrc: string) {
  document.body.innerHTML = HERO_HTML;
  const hero = document.querySelector<HTMLElement>('[data-hero]')!;
  const img = hero.querySelector<HTMLImageElement>('.hero__img')!;
  Object.defineProperty(img, 'currentSrc', { configurable: true, value: currentSrc });
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(390);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(844);
  vi.spyOn(hero, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 700, left: 0, right: 390 } as DOMRect);
  return { hero, img };
}

/** Load, then idle (jsdom has no requestIdleCallback: the 1200 ms fallback); the chunk import starts. */
function idle() {
  act(() => {
    vi.advanceTimersByTime(1200);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.setAttribute('data-motion', 'full');
  mocks.mountHeroGl.mockReturnValue({ destroy: mocks.destroy });
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-motion');
  document.body.innerHTML = '';
});

describe('HeroGlIsland (identity §5.6)', () => {
  it('mounts with the depth map of the crop in use (img.currentSrc, not img.src)', async () => {
    const { hero, img } = capableHero('http://localhost/house/balcony/hero/balcony-hero-9x16-720.avif');

    render(<HeroGlIsland />);
    idle();
    await vi.dynamicImportSettled();

    expect(mocks.mountHeroGl).toHaveBeenCalledTimes(1);
    expect(mocks.mountHeroGl).toHaveBeenCalledWith({ hero, img, depthSrc: '/house/balcony/hero/depth-9x16.webp' });
    expect(hero.dataset.gl).toBeUndefined();
  });

  it('destroys the mounted canvas on unmount', async () => {
    capableHero('http://localhost/house/balcony/hero/balcony-hero-4x5-1024.webp');

    const { unmount } = render(<HeroGlIsland />);
    idle();
    await vi.dynamicImportSettled();
    expect(mocks.destroy).not.toHaveBeenCalled();
    unmount();

    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });

  it('never mounts when unmounted while the chunk is still loading', async () => {
    capableHero('http://localhost/house/balcony/hero/balcony-hero-3x2-1440.avif');

    const { unmount } = render(<HeroGlIsland />);
    idle();
    unmount();
    await vi.dynamicImportSettled();

    expect(mocks.mountHeroGl).not.toHaveBeenCalled();
  });

  it('records off:assets and loads nothing when the crop in use is not a hero crop', async () => {
    const { hero } = capableHero('http://localhost/house/balcony/balcony_1.jpeg');

    render(<HeroGlIsland />);
    idle();
    await vi.dynamicImportSettled();

    expect(hero.dataset.gl).toBe('off:assets');
    expect(mocks.mountHeroGl).not.toHaveBeenCalled();
  });
});
