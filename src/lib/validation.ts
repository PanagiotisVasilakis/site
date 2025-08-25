import { categories } from '@/data/categories';
import { getItemsByCategory } from '@/lib/data';
import type { Category } from '@/data/schemas';
import type { Item } from '@/data/schemas';

// Throws if any localized required field missing for configured locales
export function validateLocalization(locales: string[] = ['en','el']) {
  for (const c of categories) {
    for (const loc of locales) {
      const localizedTitle = (c as Category & Record<string, unknown>)[`title_${loc}`];
      if (!(typeof localizedTitle === 'string' && localizedTitle) && !c.title) {
        throw new Error(`Missing title for category ${c.id} locale ${loc}`);
      }
    }
    const items = getItemsByCategory(c.id);
    for (const it of items) {
      for (const loc of locales) {
        const localizedName = (it as Item & Record<string, unknown>)[`name_${loc}`];
        if (!(typeof localizedName === 'string' && localizedName) && !it.name) {
          throw new Error(`Missing name for item ${it.id} locale ${loc}`);
        }
      }
    }
  }
}
