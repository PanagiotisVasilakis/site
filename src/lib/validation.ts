import { categories } from '@/data/categories';
import { getItemsByCategory } from '@/lib/data';
import type { Category } from '@/data/schemas';
import type { Item } from '@/data/schemas';
import { defaultLocale } from '@/i18n/config';

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

// Throws if any localized required field missing for configured locales.
// Non-default locales must have their own non-empty field; only the default
// locale may fall back to the base field.
export function validateLocalization(locales: string[]) {
  for (const c of categories) {
    for (const loc of locales) {
      const localizedTitle = (c as Category & Record<string, unknown>)[`title_${loc}`];
      if (!hasText(localizedTitle) && !(loc === defaultLocale && hasText(c.title))) {
        throw new Error(`Missing title for category ${c.id} locale ${loc}`);
      }
    }
    const items = getItemsByCategory(c.id);
    for (const it of items) {
      for (const loc of locales) {
        const localizedName = (it as Item & Record<string, unknown>)[`name_${loc}`];
        if (!hasText(localizedName) && !(loc === defaultLocale && hasText(it.name))) {
          throw new Error(`Missing name for item ${it.id} locale ${loc}`);
        }
      }
    }
  }
}
