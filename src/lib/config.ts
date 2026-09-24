// Centralized configuration access with safe defaults

export const config = {
  absoluteSiteUrl(): string {
    const url = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    return url.startsWith('http') ? url : `https://${url}`;
  },
};
