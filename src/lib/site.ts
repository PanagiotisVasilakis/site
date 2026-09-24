import { config } from '@/lib/config';
export const siteUrl = config.absoluteSiteUrl().replace(/\/$/, '');

// Build absolute URL from a path
export function absUrl(path: string) {
  if (!path.startsWith('/')) path = '/' + path;
  return siteUrl + path;
}
