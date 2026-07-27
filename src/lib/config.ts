// Centralized configuration access with safe defaults and parsing

function num(value: string | undefined, def: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : def;
}

const raw = {
  nodeEnv: process.env.NODE_ENV || 'development',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  analyticsRetentionDays: process.env.ANALYTICS_RETENTION_DAYS,
};

export const config = {
  nodeEnv: raw.nodeEnv,
  isProd: (raw.nodeEnv || 'development') === 'production',
  absoluteSiteUrl(): string {
    const url = raw.siteUrl || 'http://localhost:3000';
    return url.startsWith('http') ? url : `https://${url}`;
  },
  analytics: {
    retentionDays: num(raw.analyticsRetentionDays, 30),
  },
};
