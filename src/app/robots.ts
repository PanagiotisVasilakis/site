import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: '*',
				allow: '/',
				disallow: ['/en/check-in', '/el/check-in'],
			},
		],
		sitemap: `${siteUrl}/sitemap.xml`,
	};
}
