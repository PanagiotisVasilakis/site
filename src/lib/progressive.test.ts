import { describe, it, expect } from 'vitest';
import { nextVisibleCount } from './progressive';

describe('nextVisibleCount', () => {
  it('increments by step until total', () => {
    let c = 24;
    c = nextVisibleCount(c, 100, 24); // 48
    expect(c).toBe(48);
    c = nextVisibleCount(c, 100, 24); // 72
    expect(c).toBe(72);
    c = nextVisibleCount(c, 100, 24); // 96
    expect(c).toBe(96);
    c = nextVisibleCount(c, 100, 24); // 100
    expect(c).toBe(100);
    c = nextVisibleCount(c, 100, 24); // stays 100
    expect(c).toBe(100);
  });
  it('handles already full', () => {
    expect(nextVisibleCount(150, 120, 30)).toBe(120);
  });
});
