import { describe, expect, it } from 'vitest';

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { siteUrl } from '@/lib/site';

/** Noindex or private routes (identity §12 R3-V11): never in the sitemap, disallowed in robots.txt. */
const NON_INDEXABLE = ['/admin', '/api', '/offline'].concat(
  ['stay', 'guest', 'check-in', 'portal', 'offline', 'favorites'].flatMap((section) => [`/en/${section}`, `/el/${section}`]),
);

const sitemapPaths = () => sitemap().map(({ url }) => url.slice(siteUrl.length));

describe('sitemap', () => {
  it.each(['en', 'el'])('lists the privacy notice for %s', (locale) => {
    expect(sitemap().map(({ url }) => url)).toContain(`${siteUrl}/${locale}/privacy`);
  });

  it('lists no non-indexable route and claims no modification dates', () => {
    for (const path of sitemapPaths()) {
      expect(NON_INDEXABLE.filter((prefix) => path === prefix || path.startsWith(`${prefix}/`)), path).toEqual([]);
    }
    // The content is static data with no per-page update date: an invented lastmod would mislead.
    for (const entry of sitemap()) expect(entry).not.toHaveProperty('lastModified');
  });
});

describe('robots.txt', () => {
  it('disallows every non-indexable route and points to the sitemap', () => {
    const result = robots();

    expect(result.sitemap).toBe(`${siteUrl}/sitemap.xml`);
    expect(result.rules).toEqual([{ userAgent: '*', allow: '/', disallow: NON_INDEXABLE }]);
  });
});
