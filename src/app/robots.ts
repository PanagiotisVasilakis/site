import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';
import { locales } from '@/i18n/config';

const PRIVATE_LOCALIZED_SECTIONS = ['check-in', 'guest', 'portal'];

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: '*',
				allow: '/',
				disallow: [
					'/admin',
					'/api',
					...PRIVATE_LOCALIZED_SECTIONS.flatMap((section) => locales.map((locale) => `/${locale}/${section}`)),
				],
			},
		],
		sitemap: `${siteUrl}/sitemap.xml`,
	};
}
