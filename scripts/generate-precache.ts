import fs from 'node:fs';
import path from 'node:path';
import { categories } from '@/data/categories';
import { getItemsByCategory, toSlug } from '@/lib/data';
import { locales } from '@/i18n/config';

const root = path.join(process.cwd());
const outFile = path.join(root, 'public', 'precache.json');
const criticalOutFile = path.join(root, 'public', 'critical-precache.json');

function main() {
  const urls = new Set<string>();
  const critical = new Set<string>();
  // Per-category cap for critical precache (configurable via env)
  const rawCap = Number(process.env.PRECACHE_ITEMS_PER_CATEGORY ?? NaN);
  const cap = Number.isFinite(rawCap) && rawCap > 0 ? Math.floor(rawCap) : 3;
  // Home + categories + items per supported locale (from single source of truth)
  for (const locale of locales) {
    urls.add(`/${locale}`);
    critical.add(`/${locale}`);
    for (const c of categories) {
      urls.add(`/${locale}/${c.slug}`);
      critical.add(`/${locale}/${c.slug}`);
      const items = getItemsByCategory(c.id);
      let added = 0;
      for (const i of items) {
        const u = `/${locale}/${c.slug}/${i.slug ?? toSlug(i.name)}`;
        urls.add(u);
        if (added < cap) { critical.add(u); added++; }
      }
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(Array.from(urls).sort(), null, 2));
  fs.writeFileSync(criticalOutFile, JSON.stringify(Array.from(critical).sort(), null, 2));
  console.log(`Wrote ${outFile} (${urls.size} URLs) and ${criticalOutFile} (${critical.size} URLs)`);
}

main();
