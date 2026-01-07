
import { pickLocale, toSlug, getItem, getItemsByCategory } from './data';

// Assumes data files present as in repo

describe('toSlug', () => {
  it('creates kebab-case lowercase', () => {
    expect(toSlug('Hello World!')).toBe('hello-world');
  });
  it('trims dashes', () => {
    expect(toSlug('  ---Hello--- ')).toBe('hello');
  });
});

describe('pickLocale', () => {
  const obj: { name?: string; name_en?: string; name_el?: string } = { name: 'Base', name_en: 'English', name_el: 'Ελληνικά' };
  it('prefers exact locale', () => {
    expect(pickLocale(obj, 'name', 'el')).toBe('Ελληνικά');
  });
  it('falls back to base then en', () => {
    expect(pickLocale({ name: 'Base', name_en: 'English' }, 'name', 'el')).toBe('Base');
    expect(pickLocale({ name_en: 'English' }, 'name', 'el')).toBe('English');
  });
});

describe('getItem', () => {
  it('finds item by slug', () => {
    const items = getItemsByCategory('restaurants');
    if (items.length === 0) {
      // Skip gracefully if dataset trimmed
      return;
    }
    const first = items[0]!;
    const found = getItem('restaurants', first.slug || '');
    expect(found?.id).toBe(first.id);
  });
  it('returns null for missing', () => {
    expect(getItem('restaurants', 'non-existent-slug')).toBeNull();
  });
});
