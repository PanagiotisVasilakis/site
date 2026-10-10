import { categories } from '@/data/categories';
import { getItemsByCategory } from '@/lib/data';
import type { Category } from '@/data/schemas';
import type { Item } from '@/data/schemas';
import { defaultLocale } from '@/i18n/config';

// Whitespace counts as missing, as in pickLocale; otherwise a blank Greek field would fall back to English.
function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

// Item URLs are /{locale}/{category}/{slug}: lowercase ASCII words joined by single hyphens, i.e. /^[a-z0-9]+(?:-[a-z0-9]+)*$/.
// Checked word by word because lint:security flags the nested quantifier of that one-liner.
const SLUG_WORD = /^[a-z0-9]+$/;

// Throws if any localized required field missing for configured locales, or if an
// item slug is empty, malformed or used twice within its category.
// Non-default locales must have their own non-empty field; only the default
// locale may fall back to the base field.
// Items load in strict mode, so a malformed file or item fails here instead of being skipped.
export function validateLocalization(locales: string[]) {
  for (const c of categories) {
    for (const loc of locales) {
      const localizedTitle = (c as Category & Record<string, unknown>)[`title_${loc}`];
      if (!hasText(localizedTitle) && !(loc === defaultLocale && hasText(c.title))) {
        throw new Error(`Missing title for category ${c.id} locale ${loc}`);
      }
    }
    const items = getItemsByCategory(c.id, { strict: true });
    const slugOwners = new Map<string, string>();
    for (const it of items) {
      for (const loc of locales) {
        const localizedName = (it as Item & Record<string, unknown>)[`name_${loc}`];
        if (!hasText(localizedName) && !(loc === defaultLocale && hasText(it.name))) {
          throw new Error(`Missing name for item ${it.id} locale ${loc}`);
        }
      }
      // The loader gives every item its slug: the pinned one, else the one derived from the English name.
      if (it.slug === undefined) continue;
      if (it.slug === '') throw new Error(`Empty slug for item ${it.id} in category ${c.id}`);
      if (!it.slug.split('-').every((word) => SLUG_WORD.test(word))) throw new Error(`Malformed slug for item ${it.id} in category ${c.id}`);
      const owner = slugOwners.get(it.slug);
      if (owner !== undefined) throw new Error(`Duplicate slug in category ${c.id}: items ${owner} and ${it.id}`);
      slugOwners.set(it.slug, it.id);
    }
  }
}
