import { describe, expect, it } from 'vitest';

import { heroCover, parseObjectPosition } from '@/components/home/hero/heroCover';
import { heroDepthSrc, heroGateFailure } from '@/lib/motion/heroCapability';

type Rect = { top: number; bottom: number; left: number; right: number };

const IN_VIEW: Rect = { top: 0, bottom: 760, left: 0, right: 390 };

function setup({
  motion = 'full' as string | null,
  nav = { hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: false } } as Record<string, unknown>,
  visibilityState = 'visible' as DocumentVisibilityState,
  rect = IN_VIEW,
} = {}) {
  const dataset: DOMStringMap = motion === null ? {} : { motion };
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

describe('heroCover (object-fit: cover as texture scale and offset)', () => {
  it('crops the sides of a 3:2 image in a portrait box, placed by object-position x', () => {
    const [sx, sy, ox, oy] = heroCover(390, 844, 1920, 1281, 0.5, 0.5);
    expect(sx).toBeCloseTo((390 / 844) / (1920 / 1281), 10);
    expect(sy).toBe(1);
    expect(ox).toBeCloseTo((1 - sx) * 0.5, 10);
    expect(oy).toBe(0);
  });

  it('crops top and bottom of an image in a wider box, placed by object-position y', () => {
    const [sx, sy, ox, oy] = heroCover(1440, 760, 1920, 1281, 0.6, 0.4);
    expect(sx).toBe(1);
    expect(sy).toBeCloseTo((1920 / 1281) / (1440 / 760), 10);
    expect(ox).toBe(0);
    expect(oy).toBeCloseTo((1 - sy) * 0.4, 10);
  });

  it('is the identity when the aspect ratios match', () => {
    expect(heroCover(721, 1281, 721, 1281, 0.5, 0.5)).toEqual([1, 1, 0, 0]);
  });

  it('keeps the visible window inside the image for any position', () => {
    for (const [px, py] of [[0, 0], [1, 1], [0.62, 0.3]]) {
      const [sx, sy, ox, oy] = heroCover(390, 844, 1920, 1281, px, py);
      expect(ox).toBeGreaterThanOrEqual(0);
      expect(ox + sx).toBeLessThanOrEqual(1 + 1e-12);
      expect(oy).toBeGreaterThanOrEqual(0);
      expect(oy + sy).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
});

describe('parseObjectPosition', () => {
  it('reads computed percentages', () => {
    expect(parseObjectPosition('60% 40%')).toEqual([0.6, 0.4]);
    expect(parseObjectPosition(' 50% 50% ')).toEqual([0.5, 0.5]);
  });

  it('falls back to the centre for lengths, missing parts or garbage', () => {
    expect(parseObjectPosition('10px 20px')).toEqual([0.5, 0.5]);
    expect(parseObjectPosition('25%')).toEqual([0.25, 0.5]);
    expect(parseObjectPosition('')).toEqual([0.5, 0.5]);
    expect(parseObjectPosition('abc% 30%')).toEqual([0.5, 0.3]);
  });
});
