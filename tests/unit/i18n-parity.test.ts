import { describe, expect, it } from 'vitest';

import { getDictionary } from '@/i18n/dictionaries';

// Every key path (and array length) of the English dictionary exists in Greek and vice versa.
function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return [`${prefix}[length=${value.length}]`, ...value.flatMap((entry, index) => (
      entry && typeof entry === 'object' ? keyPaths(entry, `${prefix}[${index}]`) : []
    ))];
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => [`${prefix}.${key}`, ...keyPaths(entry, `${prefix}.${key}`)]);
  }
  return [];
}

describe('dictionary parity', () => {
  it('has the same keys in English and Greek', () => {
    const en = keyPaths(getDictionary('en')).sort();
    const el = keyPaths(getDictionary('el')).sort();

    expect(el.filter((path) => !en.includes(path))).toEqual([]);
    expect(en.filter((path) => !el.includes(path))).toEqual([]);
  });

  it('has no empty strings', () => {
    const empty: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'string' && value.trim() === '') empty.push(path);
      else if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
    };
    walk(getDictionary('en'), 'en');
    walk(getDictionary('el'), 'el');

    expect(empty).toEqual([]);
  });

  it('has only NFC-normalized strings (the Greek font subset has no combining tonos)', () => {
    const denormalized: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'string' && value !== value.normalize('NFC')) denormalized.push(path);
      else if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
    };
    walk(getDictionary('en'), 'en');
    walk(getDictionary('el'), 'el');

    expect(denormalized).toEqual([]);
  });

  it('uses the same placeholders in English and Greek', () => {
    const strings = (value: unknown, path: string, out: Map<string, string>) => {
      if (typeof value === 'string') out.set(path, value);
      else if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) strings(entry, `${path}.${key}`, out);
      return out;
    };
    const names = (text = '') => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const en = strings(getDictionary('en'), '', new Map());
    const el = strings(getDictionary('el'), '', new Map());
    expect([...en].filter(([path, text]) => names(text) !== names(el.get(path)))).toEqual([]);
  });
});
