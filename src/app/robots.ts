import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';
import { locales } from '@/i18n/config';

/** Noindex localized sections (each also sets robots noindex): never in the sitemap. */
const PRIVATE_LOCALIZED_SECTIONS = ['stay', 'guest', 'check-in', 'portal', 'offline', 'favorites'];

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: '*',
				allow: '/',
				disallow: [
					'/admin',
					'/api',
					'/offline',
					...PRIVATE_LOCALIZED_SECTIONS.flatMap((section) => locales.map((locale) => `/${locale}/${section}`)),
				],
			},
		],
		sitemap: `${siteUrl}/sitemap.xml`,
	};
}
