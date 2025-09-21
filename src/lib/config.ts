// Centralized configuration access with safe defaults and parsing

function bool(value: string | undefined, def = false): boolean {
  if (value == null) return def;
  return value === '1' || value === 'true';
}

function num(value: string | undefined, def: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : def;
}

const raw = {
  nodeEnv: process.env.NODE_ENV || 'development',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  vercelUrl: process.env.VERCEL_URL,
  analyticsPersist: process.env.ANALYTICS_PERSIST,
  analyticsRetentionDays: process.env.ANALYTICS_RETENTION_DAYS,
  analyticsStorage: process.env.ANALYTICS_STORAGE,
  analyticsHashPaths: process.env.ANALYTICS_HASH_PATHS,
  adminDashSecret: process.env.ADMIN_DASH_SECRET,
  
};

export const config = {
  nodeEnv: raw.nodeEnv,
  isProd: (raw.nodeEnv || 'development') === 'production',
  absoluteSiteUrl(): string {
    const url = raw.siteUrl || raw.vercelUrl || 'http://localhost:3000';
    return url.startsWith('http') ? url : `https://${url}`;
  },
  analytics: {
    persist: bool(raw.analyticsPersist, false),
    retentionDays: num(raw.analyticsRetentionDays, 30),
    storage: raw.analyticsStorage || 'file',
    hashPaths: bool(raw.analyticsHashPaths, false),
  },
  admin: {
    secret: raw.adminDashSecret || '',
  },
  
};

export type AppConfig = typeof config;


