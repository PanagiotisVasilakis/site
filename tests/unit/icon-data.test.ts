import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '@/components/icons/iconNames';
import { categories } from '@/data/categories';
import { CategorySchema } from '@/data/schemas';
import { locationPanelTranslations } from '@/i18n/domains/house';
import { locales } from '@/i18n/config';

const valid = new Set<string>(ICON_NAMES);
// Any pictographic emoji (the data used to carry emoji strings as icons).
const EMOJI = /\p{Extended_Pictographic}/u;

describe('content icons reference the Icon set (identity §6)', () => {
  it('categories use valid icon names and the schema rejects emoji', () => {
    for (const category of categories) {
      expect(valid.has(category.icon ?? '')).toBe(true);
    }
    expect(CategorySchema.safeParse({ ...categories[0], icon: '☎️' }).success).toBe(false);
  });

  it.each(locales)('house highlights (%s) use valid icon names, bus for the bus stop', (locale) => {
    const { highlights } = locationPanelTranslations[locale];
    expect(highlights.length).toBeGreaterThan(0);
    for (const highlight of highlights) {
      expect(valid.has(highlight.icon)).toBe(true);
      expect(highlight.title).not.toMatch(EMOJI);
    }
    expect(highlights.map(({ icon }) => icon)).toEqual(['museum', 'museum', 'museum', 'plane', 'map-pin', 'beach', 'bus']);
  });
});
