import { describe, it, expect } from 'vitest';
import { isRecentlyUpdated, mapsHref, telHref } from './data';

import type { Item } from '../data/schemas';

describe('isRecentlyUpdated', () => {
  const base: Item = {
    id: 'x', categoryId: 'y', name: 'z'
  };
  it('returns true for recent date', () => {
    const item: Item = { ...base, updatedAt: new Date(Date.now() - 5 * 86400_000).toISOString() };
    expect(isRecentlyUpdated(item)).toBe(true);
  });
  it('returns false for old date', () => {
    const item: Item = { ...base, updatedAt: new Date(Date.now() - 40 * 86400_000).toISOString() };
    expect(isRecentlyUpdated(item)).toBe(false);
  });
  it('returns false for missing/invalid date', () => {
    expect(isRecentlyUpdated(base)).toBe(false);
    expect(isRecentlyUpdated({ ...base, updatedAt: 'not-a-date' })).toBe(false);
  });
});

describe('mapsHref', () => {
  it('returns lat/lng url if present', () => {
    expect(mapsHref(undefined, 1, 2)).toMatch('1,2');
  });
  it('returns address url if no lat/lng', () => {
    expect(mapsHref('Main St')).toMatch('Main%20St');
  });
  it('returns undefined if no data', () => {
    expect(mapsHref()).toBeUndefined();
  });
});

describe('telHref', () => {
  it('formats phone number', () => {
    expect(telHref('+30 123 456')).toBe('tel:+30123456');
    expect(telHref('123-456')).toBe('tel:123456');
  });
  it('returns undefined for missing', () => {
    expect(telHref()).toBeUndefined();
  });
});
