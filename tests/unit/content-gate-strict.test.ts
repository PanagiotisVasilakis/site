import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { categories } from '@/data/categories';
import { locales } from '@/i18n/config';
import { getItem, getItemsByCategory, toSlug } from '@/lib/data';
import { logger } from '@/lib/logger-enterprise';
import { validateLocalization } from '@/lib/validation';

const place = {
  id: 'old-town',
  categoryId: 'fixture',
  name: 'Old Town',
  name_el: 'Παλιά πόλη',
  website: 'https://example.com/old-town',
  location: { lat: 37.04, lng: 22.11 },
};

/** Serves `content` as the file of the category `fixture`; no real file is read. */
function serve(content: unknown): void {
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  vi.spyOn(fs, 'readFileSync').mockReturnValue(typeof content === 'string' ? content : JSON.stringify(content));
}

function silenceLogger() {
  return vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
}

function strictFailure(): string {
  try {
    getItemsByCategory('fixture', { strict: true });
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('the strict load did not throw');
}

describe('getItemsByCategory strict mode (build gate, R-421/R-456)', () => {
  it('throws on a link without a scheme and names the category, item index, id and field but not the value', () => {
    serve([place, { ...place, id: 'bad-link', name: 'Bad Link', website: 'www.example.gr' }]);

    const message = strictFailure();

    expect(message).toBe('Invalid item in category fixture (index 1, id "bad-link"): website (invalid_format)');
    expect(message).not.toContain('example.gr');
  });

  it('throws on a misspelled key and names the key but not its value', () => {
    serve([{ ...place, adress_el: 'Οδός Αρχιμήδους 21' }]);

    const message = strictFailure();

    expect(message).toBe('Invalid item in category fixture (index 0, id "old-town"): adress_el (unrecognized_keys)');
    expect(message).not.toContain('Αρχιμήδους');
  });

  it('names the array position of a bad nested value and reports every problem of the item', () => {
    serve([{ ...place, sourceUrls: ['https://example.com/a', 'nope'], summery_el: 'x' }]);

    const message = strictFailure();

    expect(message).toContain('sourceUrls.1 (invalid_format)');
    expect(message).toContain('summery_el (unrecognized_keys)');
    expect(message).not.toContain('nope');
  });

  it('names an item without a usable id by its index only', () => {
    serve([{ ...place, id: 7 }]);

    expect(strictFailure()).toBe('Invalid item in category fixture (index 0): id (invalid_type)');
  });

  it.each([[null], ['text'], [42]])('throws on the non-object entry %j', (entry) => {
    serve([place, entry]);

    expect(strictFailure()).toBe('Category fixture: entry 1 is not an object');
  });

  it.each([
    ['a file that is not an array', '{"not":"an array"}', 'Category data file fixture does not contain an array'],
    ['a file that is not valid JSON', '[{', 'Category data file fixture is not valid JSON'],
  ])('throws on %s, where the default load only returns an empty list', (_name, content, message) => {
    serve(content);
    silenceLogger();

    expect(strictFailure()).toBe(message);
    expect(getItemsByCategory('fixture')).toEqual([]);
  });

  it('loads a valid category identically in both modes', () => {
    serve([place, { ...place, id: 'sea-front', name: 'Sea Front' }]);

    const strict = getItemsByCategory('fixture', { strict: true });

    expect(strict.map((item) => item.id)).toEqual(['old-town', 'sea-front']);
    expect(strict).toEqual(getItemsByCategory('fixture'));
  });

  it('keeps the default load resilient: it logs and skips an invalid item and a non-object entry, and strips an unknown key', () => {
    const warn = silenceLogger();
    serve([
      place,
      { ...place, id: 'bad-link', name: 'Bad Link', website: 'www.example.gr' },
      null,
      { ...place, id: 'typo', name: 'Typo', adress_el: 'x' },
    ]);

    const items = getItemsByCategory('fixture');

    expect(items.map((item) => item.id)).toEqual(['old-town', 'typo']);
    expect(items[1]).not.toHaveProperty('adress_el');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Invalid item skipped in category data', {
      issues: [expect.objectContaining({ path: ['website'], code: 'invalid_format' })],
    });
  });
});

describe('item slugs (decision O50, R-446)', () => {
  const pinned = { ...place, slug: 'pinned-old-town' };
  const derived = { ...place, id: 'plain', name: 'Plain Name' };
  const blank = { ...place, id: 'blank', name: 'Blank Slug', slug: '' };

  it.each([[undefined], [{ strict: true }]])('uses an explicit non-empty slug and derives the others from the name (options %j)', (options) => {
    serve([pinned, derived, blank]);

    expect(getItemsByCategory('fixture', options).map((item) => item.slug)).toEqual(['pinned-old-town', 'plain-name', 'blank-slug']);
  });

  it('routes the pinned slug and no longer the one derived from the name', () => {
    serve([pinned]);

    expect(getItem('fixture', 'pinned-old-town')?.id).toBe('old-town');
    expect(getItem('fixture', toSlug('Old Town'))).toBeNull();
  });

  it('hands the gate an empty slug for a name without ASCII letters or digits, so that it can reject it', () => {
    serve([{ ...place, id: 'greek-only', name: 'Παλιά πόλη' }]);

    expect(getItemsByCategory('fixture', { strict: true }).map((item) => item.slug)).toEqual(['']);
  });
});

describe('the committed content', () => {
  it.each(categories.map((category) => category.id))('loads %s in strict mode, identically to the default load', (categoryId) => {
    const strict = getItemsByCategory(categoryId, { strict: true });

    expect(strict.length).toBeGreaterThan(0);
    expect(strict).toEqual(getItemsByCategory(categoryId));
    // The gate checks the slug the loader assigns; without one it would have nothing to check.
    expect(strict.filter((item) => !item.slug)).toEqual([]);
  });

  it('passes the build gate for every locale', () => {
    expect(() => validateLocalization([...locales])).not.toThrow();
  });
});
