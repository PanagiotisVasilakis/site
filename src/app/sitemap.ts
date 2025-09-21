import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  // Minimal static sitemap; extended versions can enumerate locale routes.
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const urls: string[] = [
    '/',
    '/en',
    '/el',
    // Add other public pages here, but intentionally exclude /check-in
  ];
  return urls.map((u) => ({ url: `${base}${u}`, changeFrequency: 'weekly', priority: u === '/' ? 1 : 0.6 }));
}
