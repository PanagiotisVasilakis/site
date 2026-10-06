const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const siteUrl = (configuredSiteUrl.startsWith('http') ? configuredSiteUrl : `https://${configuredSiteUrl}`).replace(/\/$/, '');

// Build absolute URL from a path
export function absUrl(path: string) {
  if (!path.startsWith('/')) path = '/' + path;
  return siteUrl + path;
}
