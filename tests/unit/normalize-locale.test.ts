import { describe, expect, it } from 'vitest';

import { normalizeLocale } from '@/i18n/config';

describe('normalizeLocale', () => {
  it.each([
    ['el', 'el'],
    ['en', 'en'],
    ['EL', 'en'],
    ['de', 'en'],
    ['', 'en'],
    [null, 'en'],
    [undefined, 'en'],
    ['../el', 'en'],
  ] as const)('maps %j to %s', (value, expected) => {
    expect(normalizeLocale(value)).toBe(expected);
  });
});
