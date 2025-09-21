import { NextResponse } from 'next/server';
import { categories } from '@/data/categories';
import { getItemsByCategory, toSlug } from '@/lib/data';
import { siteUrl } from '@/lib/site';

export const revalidate = 3600; // 1 hour

export function GET() {
  const locales = ['en','el'] as const;
  const urls: string[] = [];
  for (const locale of locales) {
    urls.push(`${siteUrl}/${locale}`);
    // Include guest portal entry but exclude protected check-in
    urls.push(`${siteUrl}/${locale}/guest`);
    for (const c of categories) {
      urls.push(`${siteUrl}/${locale}/${c.slug}`);
      const items = getItemsByCategory(c.id);
      for (const i of items) urls.push(`${siteUrl}/${locale}/${c.slug}/${i.slug ?? toSlug(i.name)}`);
    }
    urls.push(`${siteUrl}/${locale}/offline`);
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u)=>`  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>`;
  return new NextResponse(body, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' } });
}
