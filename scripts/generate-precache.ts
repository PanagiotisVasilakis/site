import fs from 'node:fs';
import path from 'node:path';
import { categories } from '@/data/categories';
import { getItemsByCategory, toSlug } from '@/lib/data';

const root = path.join(process.cwd());
const outFile = path.join(root, 'public', 'precache.json');

function main() {
  const urls = new Set<string>();
  // Home per-locale
  for (const locale of ['en', 'el']) urls.add(`/${locale}`);
  // Categories and items per-locale
  for (const c of categories) {
    for (const locale of ['en', 'el']) {
      urls.add(`/${locale}/${c.slug}`);
      const items = getItemsByCategory(c.id);
      for (const i of items) urls.add(`/${locale}/${c.slug}/${i.slug ?? toSlug(i.name)}`);
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(Array.from(urls).sort(), null, 2));
  console.log(`Wrote ${outFile} with ${urls.size} URLs`);
}

main();
