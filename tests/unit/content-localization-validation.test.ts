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
});
