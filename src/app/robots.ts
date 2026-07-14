import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: '*',
				allow: '/',
				disallow: ['/admin', '/api', '/en/check-in', '/el/check-in', '/en/guest', '/el/guest', '/en/portal', '/el/portal'],
			},
		],
		sitemap: `${siteUrl}/sitemap.xml`,
	};
}
