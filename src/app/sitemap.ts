import type { MetadataRoute } from 'next';
import { categories } from '@/data/categories';
import { getItemsByCategory, toSlug } from '@/lib/data';
import { siteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
	const locales = ['en', 'el'] as const;
	const urls: MetadataRoute.Sitemap = [];
	for (const locale of locales) {
		urls.push({ url: `${siteUrl}/${locale}`, changeFrequency: 'weekly', priority: 0.8 });
		urls.push({ url: `${siteUrl}/${locale}/book`, changeFrequency: 'weekly', priority: 0.7 });
		urls.push({ url: `${siteUrl}/${locale}/apartment`, changeFrequency: 'monthly', priority: 0.8 });
		urls.push({ url: `${siteUrl}/${locale}/booking-details`, changeFrequency: 'monthly', priority: 0.5 });
		urls.push({ url: `${siteUrl}/${locale}/about`, changeFrequency: 'monthly', priority: 0.5 });
		for (const c of categories) {
			urls.push({ url: `${siteUrl}/${locale}/${c.slug}`, changeFrequency: 'weekly', priority: 0.7 });
			const items = getItemsByCategory(c.id);
			for (const i of items) {
				const itemSlug = i.slug ?? toSlug(i.name);
				urls.push({ url: `${siteUrl}/${locale}/${c.slug}/${itemSlug}`, changeFrequency: 'weekly', priority: 0.5 });
			}
		}
	}
	// Intentionally exclude /check-in and other protected paths
	return urls;
}
