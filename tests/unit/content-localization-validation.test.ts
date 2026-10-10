import { beforeEach, describe, expect, it, vi } from 'vitest';

const { categoriesMock, getItemsByCategoryMock } = vi.hoisted(() => ({
  categoriesMock: [] as Array<Record<string, unknown>>,
  getItemsByCategoryMock: vi.fn(),
}));

vi.mock('@/data/categories', () => ({ categories: categoriesMock }));
vi.mock('@/lib/data', () => ({ getItemsByCategory: getItemsByCategoryMock }));

import { validateLocalization } from '@/lib/validation';

const category = { id: 'food', title: 'Food', title_en: 'Food', title_el: 'Φαγητό' };
const item = { id: 'taverna', name: 'Taverna', name_en: 'Taverna', name_el: 'Ταβέρνα' };

describe('validateLocalization', () => {
  beforeEach(() => {
    categoriesMock.length = 0;
    categoriesMock.push({ ...category });
    getItemsByCategoryMock.mockReturnValue([{ ...item }]);
  });

  it('passes when every locale has a localized title and name', () => {
    expect(() => validateLocalization(['en', 'el'])).not.toThrow();
  });

  it('throws when an item is missing name_el even though the base name exists', () => {
    getItemsByCategoryMock.mockReturnValue([{ id: 'taverna', name: 'Taverna', name_en: 'Taverna' }]);
    expect(() => validateLocalization(['en', 'el'])).toThrow('Missing name for item taverna locale el');
  });

  it('throws when an item has an empty name_el', () => {
    getItemsByCategoryMock.mockReturnValue([{ ...item, name_el: '' }]);
    expect(() => validateLocalization(['en', 'el'])).toThrow('Missing name for item taverna locale el');
  });

  it('throws when a category is missing title_el even though the base title exists', () => {
    categoriesMock.length = 0;
    categoriesMock.push({ id: 'food', title: 'Food', title_en: 'Food' });
    expect(() => validateLocalization(['en', 'el'])).toThrow('Missing title for category food locale el');
  });

  it('accepts the base field for the default locale', () => {
    categoriesMock.length = 0;
    categoriesMock.push({ id: 'food', title: 'Food', title_el: 'Φαγητό' });
    getItemsByCategoryMock.mockReturnValue([{ id: 'taverna', name: 'Taverna', name_el: 'Ταβέρνα' }]);
    expect(() => validateLocalization(['en', 'el'])).not.toThrow();
  });

  it('loads the items of every category in strict mode', () => {
    validateLocalization(['en', 'el']);
    expect(getItemsByCategoryMock).toHaveBeenCalledWith('food', { strict: true });
  });

  // pickLocale treats a whitespace-only value as missing, so the gate must too (R-437).
  it.each([' ', '\t\n'])('throws when an item has the whitespace-only name_el %j', (blank) => {
    getItemsByCategoryMock.mockReturnValue([{ ...item, name_el: blank }]);
    expect(() => validateLocalization(['en', 'el'])).toThrow('Missing name for item taverna locale el');
  });

  it.each([' ', '\t\n'])('throws when a category has the whitespace-only title_el %j', (blank) => {
    categoriesMock.length = 0;
    categoriesMock.push({ ...category, title_el: blank });
    expect(() => validateLocalization(['en', 'el'])).toThrow('Missing title for category food locale el');
  });

  it('does not accept a whitespace-only base field for the default locale', () => {
    getItemsByCategoryMock.mockReturnValue([{ id: 'taverna', name: ' ', name_el: 'Ταβέρνα' }]);
    expect(() => validateLocalization(['en', 'el'])).toThrow('Missing name for item taverna locale en');

    categoriesMock.length = 0;
    categoriesMock.push({ id: 'food', title: ' ', title_el: 'Φαγητό' });
    getItemsByCategoryMock.mockReturnValue([]);
    expect(() => validateLocalization(['en', 'el'])).toThrow('Missing title for category food locale en');
  });

  describe('item slugs (decision O50, R-446)', () => {
    const slugged = (id: string, slug: string) => ({ ...item, id, slug });

    it('accepts distinct well-formed slugs, also when another category uses the same ones', () => {
      categoriesMock.push({ id: 'drink', title: 'Drink', title_en: 'Drink', title_el: 'Ποτό' });
      getItemsByCategoryMock.mockReturnValue([slugged('taverna', 'old-taverna'), slugged('cafe', 'cafe-2')]);
      expect(() => validateLocalization(['en', 'el'])).not.toThrow();
    });

    it('throws on an empty slug, which a name without ASCII letters or digits derives', () => {
      getItemsByCategoryMock.mockReturnValue([slugged('taverna', '')]);
      expect(() => validateLocalization(['en', 'el'])).toThrow('Empty slug for item taverna in category food');
    });

    it.each(['Old-Taverna', 'old taverna', ' old', '-old', 'old-', 'old--taverna', 'old_taverna', 'old/taverna', 'ταβέρνα'])(
      'throws on the malformed slug %j',
      (slug) => {
        getItemsByCategoryMock.mockReturnValue([slugged('taverna', slug)]);
        expect(() => validateLocalization(['en', 'el'])).toThrow('Malformed slug for item taverna in category food');
      },
    );

    it('throws when two items of a category share a slug', () => {
      getItemsByCategoryMock.mockReturnValue([slugged('taverna', 'old-town'), slugged('cafe', 'old-town')]);
      expect(() => validateLocalization(['en', 'el'])).toThrow('Duplicate slug in category food: items taverna and cafe');
    });
  });
});
