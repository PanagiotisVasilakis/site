import { describe, expect, it } from 'vitest';

import { heroCover, parseObjectPosition } from '@/components/home/hero/heroCover';

describe('heroCover (object-fit: cover as texture scale and offset)', () => {
  it('crops the sides of a 3:2 image in a portrait box, placed by object-position x', () => {
    // Box 390 × 844 (aspect .462), image 1920 × 1281 (aspect 1.499): width is cropped.
    const [sx, sy, ox, oy] = heroCover(390, 844, 1920, 1281, 0.5, 0.5);
    expect(sx).toBeCloseTo((390 / 844) / (1920 / 1281), 10);
    expect(sy).toBe(1);
    expect(ox).toBeCloseTo((1 - sx) * 0.5, 10);
    expect(oy).toBe(0);
  });

  it('crops top and bottom of an image in a wider box, placed by object-position y', () => {
    // Box 1440 × 760 (aspect 1.895), image 3:2: height is cropped; 60% 40% as on desktop.
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
