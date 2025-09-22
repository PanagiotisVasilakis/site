/// <reference types="vitest" />
// Vitest globals are enabled; no named imports needed.
import { describe, expect, it } from 'vitest';
import { addHits, getHits, topPaths, hourBuckets, dayBuckets } from './analyticsStore';

describe('analyticsStore basic', () => {
  it('adds hits and aggregates top paths', () => {
    const before = getHits().length;
    addHits([{ path: '/a', ts: Date.now(), locale: 'en' }, { path: '/a', ts: Date.now(), locale: 'en' }, { path: '/b', ts: Date.now(), locale: 'en' }], 'UA');
    const after = getHits().length;
    expect(after - before).toBe(3);
    const top = topPaths(2);
    expect(top[0].path).toBeDefined();
    expect(top[0].count).toBeGreaterThanOrEqual(2);
  });
  it('creates hour and day buckets', () => {
    const hours = hourBuckets();
    const days = dayBuckets();
    expect(hours.length).toBe(24);
    expect(days.length).toBe(30);
  });
});
