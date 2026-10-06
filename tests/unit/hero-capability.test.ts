import { describe, expect, it } from 'vitest';

import { heroDepthSrc, heroGateFailure } from '@/lib/motion/heroCapability';

type Rect = { top: number; bottom: number; left: number; right: number };

const IN_VIEW: Rect = { top: 0, bottom: 760, left: 0, right: 390 };

function setup({
  motion = 'full' as string | null,
  nav = { hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: false } } as Record<string, unknown>,
  visibilityState = 'visible' as DocumentVisibilityState,
  rect = IN_VIEW,
} = {}) {
  const dataset: DOMStringMap = motion === null ? {} : { motion }; // null: attribute absent
  const doc = { visibilityState, documentElement: { dataset, clientHeight: 844, clientWidth: 390 } };
  const hero = { getBoundingClientRect: () => rect };
  return heroGateFailure(nav, doc, hero);
}

describe('heroGateFailure (identity §5.6 capability gate)', () => {
  it('passes a capable, visible device with motion armed', () => {
    expect(setup()).toBeNull();
  });

  it('treats unknown deviceMemory, cores and connection as unknown, not as a fail', () => {
    expect(setup({ nav: {} })).toBeNull();
  });

  it.each([
    ['data-motion missing', { motion: null }, 'reduced-motion'],
    ['data-motion="reduce"', { motion: 'reduce' }, 'reduced-motion'],
    ['Save-Data', { nav: { hardwareConcurrency: 8, connection: { saveData: true } } }, 'save-data'],
    ['deviceMemory < 4', { nav: { deviceMemory: 2, hardwareConcurrency: 8 } }, 'low-memory'],
    ['hardwareConcurrency < 4', { nav: { deviceMemory: 8, hardwareConcurrency: 2 } }, 'low-cpu'],
    ['a hidden tab', { visibilityState: 'hidden' as DocumentVisibilityState }, 'hidden'],
    ['the hero scrolled above the viewport', { rect: { top: -900, bottom: -140, left: 0, right: 390 } }, 'not-in-view'],
    ['the hero below the viewport', { rect: { top: 844, bottom: 1604, left: 0, right: 390 } }, 'not-in-view'],
  ])('aborts on %s', (_name, options, reason) => {
    expect(setup(options)).toBe(reason);
  });

  it('accepts exactly 4 GB and 4 cores', () => {
    expect(setup({ nav: { deviceMemory: 4, hardwareConcurrency: 4 } })).toBeNull();
  });
});

describe('heroDepthSrc (depth map for the crop in use, identity §7.2)', () => {
  it.each([
    ['http://127.0.0.1:3000/house/balcony/hero/balcony-hero-9x16-720.avif', '/house/balcony/hero/depth-9x16.webp'],
    ['/house/balcony/hero/balcony-hero-9x16-480.webp', '/house/balcony/hero/depth-9x16.webp'],
    ['/house/balcony/hero/balcony-hero-4x5-1024.avif', '/house/balcony/hero/depth-4x5.webp'],
    ['/house/balcony/hero/balcony-hero-3x2-1920.webp', '/house/balcony/hero/depth-3x2.webp'],
  ])('%s → %s', (currentSrc, depth) => {
    expect(heroDepthSrc(currentSrc)).toBe(depth);
  });

  it('is null for an unknown or empty source', () => {
    expect(heroDepthSrc('')).toBeNull();
    expect(heroDepthSrc('/house/balcony/balcony_1.jpeg')).toBeNull();
  });
});
