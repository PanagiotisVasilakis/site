import type { MetadataRoute } from 'next';
import { categories } from '@/data/categories';
import { getItemsByCategory, toSlug } from '@/lib/data';
import { siteUrl } from '@/lib/site';
import { locales } from '@/i18n/config';

// Only the indexable public pages: the noindex sections (robots.ts) are left out. No lastModified:
// the content is static data with no per-page update date, and a build date would claim changes.
export default function sitemap(): MetadataRoute.Sitemap {
	const urls: MetadataRoute.Sitemap = [];
	for (const locale of locales) {
		urls.push({ url: `${siteUrl}/${locale}`, changeFrequency: 'weekly', priority: 0.8 });
		urls.push({ url: `${siteUrl}/${locale}/availability`, changeFrequency: 'weekly', priority: 0.8 });
		urls.push({ url: `${siteUrl}/${locale}/apartment`, changeFrequency: 'monthly', priority: 0.8 });
		urls.push({ url: `${siteUrl}/${locale}/privacy`, changeFrequency: 'yearly', priority: 0.3 });
		for (const c of categories) {
			urls.push({ url: `${siteUrl}/${locale}/${c.slug}`, changeFrequency: 'weekly', priority: 0.7 });
			const items = getItemsByCategory(c.id);
			for (const i of items) {
				const itemSlug = i.slug ?? toSlug(i.name);
				urls.push({ url: `${siteUrl}/${locale}/${c.slug}/${itemSlug}`, changeFrequency: 'weekly', priority: 0.5 });
			}
		}
	}
	return urls;
}
