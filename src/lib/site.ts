import { config } from '@/lib/config';
export const siteUrl = config.absoluteSiteUrl().replace(/\/$/, '');

// Build absolute URL from a path
export function absUrl(path: string) {
  if (!path.startsWith('/')) path = '/' + path;
  return siteUrl + path;
}

// Replace placeholder domains in seeded data with runtime siteUrl
const PLACEHOLDER_DOMAIN = 'https://yourdomain.example';
export function normalizeExternalUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith(PLACEHOLDER_DOMAIN)) {
    const suffix = url.slice(PLACEHOLDER_DOMAIN.length);
    return siteUrl + suffix;
  }
  return url;
}
