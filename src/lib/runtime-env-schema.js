import { z } from 'zod';

const optionalEnv = (schema) => z.preprocess(
  (value) => value === '' ? undefined : value,
  schema.optional(),
);

function isPostgresUrl(value) {
  const protocol = new URL(value).protocol;
  return protocol === 'postgresql:' || protocol === 'postgres:';
}

function isApiKeyList(value) {
  const keys = value.split(',').map((key) => key.trim()).filter(Boolean);
  return keys.length > 0 && keys.every((key) => key.length >= 32 && key.length <= 64 && key.split('').every((character) => (
    (character >= 'a' && character <= 'z')
    || (character >= 'A' && character <= 'Z')
    || (character >= '0' && character <= '9')
  )));
}

function isTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function hasRepeatedSecretPattern(value) {
  for (let size = 1; size <= 16; size += 1) {
    if (value.length % size === 0
      && value === value.slice(0, size).repeat(value.length / size)) return true;
  }
  return false;
}

function isOriginProxySecret(value) {
  return /^[0-9a-fA-F]{64}$/u.test(value)
    && !hasRepeatedSecretPattern(value)
    && !/^(?:deadbeef|changeme|placeholder)/iu.test(value);
}

export const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),

  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL is required').refine(isPostgresUrl, 'DATABASE_URL must use postgres or postgresql'),

  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters'),
  ADMIN_DASH_SECRET: z.string().min(20, 'ADMIN_DASH_SECRET must be at least 20 characters'),
  GUEST_JWT_SECRET: z.string().min(32, 'GUEST_JWT_SECRET must be at least 32 characters'),
  SECURITY_ENC_KEY_HEX: z.string().regex(/^[0-9a-fA-F]{64}$/, 'SECURITY_ENC_KEY_HEX must be exactly 64 hex characters'),
  SECURITY_ENC_KEY_HEX_PREVIOUS: optionalEnv(z.string().regex(/^[0-9a-fA-F]{64}$/, 'SECURITY_ENC_KEY_HEX_PREVIOUS must be exactly 64 hex characters')),
  SECURITY_PEPPER: z.string().min(16, 'SECURITY_PEPPER must be at least 16 characters'),
  CLAIM_TOKEN_PEPPER: optionalEnv(z.string().min(32, 'CLAIM_TOKEN_PEPPER must be at least 32 characters')),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  GUEST_WIFI_NETWORK: z.string().min(1, 'GUEST_WIFI_NETWORK is required'),
  GUEST_WIFI_PASSWORD: z.string().min(8, 'GUEST_WIFI_PASSWORD must be at least 8 characters'),
  PROPERTY_TIME_ZONE: z.string().refine(isTimeZone, 'PROPERTY_TIME_ZONE must be a valid IANA time zone').default('Europe/Athens'),

  VALID_API_KEYS: optionalEnv(z.string().refine(isApiKeyList, 'VALID_API_KEYS contains an invalid key')),
  INTERNAL_API_KEYS: optionalEnv(z.string().refine(isApiKeyList, 'INTERNAL_API_KEYS contains an invalid key')),
  METRICS_WRITE_API_KEYS: optionalEnv(z.string().refine(isApiKeyList, 'METRICS_WRITE_API_KEYS contains an invalid key')),

  ALLOWED_ORIGINS: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_OSRM_BASE_URL: optionalEnv(z.string().url()),
  NEXT_PUBLIC_ENABLE_PERF_TELEMETRY: optionalEnv(z.enum(['true', 'false'])),
  BUILD_SITE_URL: optionalEnv(z.string().url()),
  ORIGIN_PROXY_SHARED_SECRET: optionalEnv(z.string().refine(
    isOriginProxySecret,
    'ORIGIN_PROXY_SHARED_SECRET must be a non-placeholder 64-character hexadecimal secret',
  )),

  BOOKING_REQUEST_WEBHOOK_URL: optionalEnv(z.string().url()),
  BOOKING_REQUEST_WEBHOOK_TOKEN: optionalEnv(z.string().min(20)),
  CHECKIN_REQUEST_WEBHOOK_URL: optionalEnv(z.string().url()),
  CHECKIN_REQUEST_WEBHOOK_TOKEN: optionalEnv(z.string().min(20)),
  ALERT_WEBHOOK_URL: optionalEnv(z.string().url()),
  ALERT_WEBHOOK_TOKEN: optionalEnv(z.string().min(20)),
  ALERT_WEBHOOK_REQUIRED: z.enum(['0', '1']).optional().default('0'),
  CRON_SECRET: optionalEnv(z.string().min(32)),

  DEV_SESSION_MINT_ENABLED: z.enum(['0', '1']).optional().default('0'),
  DEV_SESSION_MINT_SECRET: optionalEnv(z.string().min(32)),
  ANALYTICS_RETENTION_DAYS: z.string().regex(/^\d+$/).optional().default('30'),
  GUEST_REFRESH_ALLOW_LEGACY_SECRET_ONLY: optionalEnv(z.enum(['0', '1'])),
  PRISMA_AUTO_DISCONNECT: optionalEnv(z.enum(['true', 'false'])),
  PRISMA_IDLE_DISCONNECT_MS: optionalEnv(z.string().regex(/^\d+$/)),
  PRISMA_LOG_LIFECYCLE: optionalEnv(z.enum(['0', '1'])),
  LOG_LEVEL: optionalEnv(z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])),
  LOG_CONSOLE: optionalEnv(z.enum(['true', 'false'])),
  LOG_STRUCTURED: optionalEnv(z.enum(['true', 'false'])),
  LOG_PERFORMANCE: optionalEnv(z.enum(['true', 'false'])),
  LOG_MAX_METADATA_SIZE: optionalEnv(z.string().regex(/^\d+$/)),

  RATE_LIMIT_BACKEND: optionalEnv(z.enum(['redis'])),
  RATE_LIMIT_NAMESPACE: optionalEnv(z.string().regex(/^[A-Za-z0-9:_-]{1,64}$/, 'RATE_LIMIT_NAMESPACE contains invalid characters')),
  UPSTASH_REDIS_REST_URL: optionalEnv(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: optionalEnv(z.string().min(20)),
}).superRefine((env, context) => {
  if (env.NODE_ENV === 'production' && !env.NEXT_PUBLIC_SITE_URL) {
    context.addIssue({ code: 'custom', path: ['NEXT_PUBLIC_SITE_URL'], message: 'NEXT_PUBLIC_SITE_URL is required in production' });
  }
  if (env.NODE_ENV === 'production' && env.NEXT_PUBLIC_SITE_URL) {
    const siteUrl = new URL(env.NEXT_PUBLIC_SITE_URL);
    if (siteUrl.protocol !== 'https:') {
      context.addIssue({ code: 'custom', path: ['NEXT_PUBLIC_SITE_URL'], message: 'NEXT_PUBLIC_SITE_URL must use HTTPS in production' });
    }
  }
  if (env.BUILD_SITE_URL && env.NEXT_PUBLIC_SITE_URL !== env.BUILD_SITE_URL) {
    context.addIssue({ code: 'custom', path: ['NEXT_PUBLIC_SITE_URL'], message: 'Runtime site URL does not match the URL compiled into this image' });
  }
  if (env.SECURITY_ENC_KEY_HEX_PREVIOUS && env.SECURITY_ENC_KEY_HEX_PREVIOUS === env.SECURITY_ENC_KEY_HEX) {
    context.addIssue({ code: 'custom', path: ['SECURITY_ENC_KEY_HEX_PREVIOUS'], message: 'Previous encryption key must differ from the current key' });
  }
  if (env.ALLOWED_ORIGINS) {
    for (const configuredOrigin of env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)) {
      try {
        const parsed = new URL(configuredOrigin);
        if (parsed.origin !== configuredOrigin
          || (env.NODE_ENV === 'production' && parsed.protocol !== 'https:')) {
          throw new Error('invalid origin');
        }
      } catch {
        context.addIssue({ code: 'custom', path: ['ALLOWED_ORIGINS'], message: `Invalid allowed origin: ${configuredOrigin}` });
      }
      if (env.NODE_ENV === 'production' && configuredOrigin === '*') {
        context.addIssue({ code: 'custom', path: ['ALLOWED_ORIGINS'], message: 'Wildcard CORS origins are forbidden in production' });
      }
    }
  }
  if (env.NODE_ENV === 'production' && !env.ORIGIN_PROXY_SHARED_SECRET) {
    context.addIssue({ code: 'custom', path: ['ORIGIN_PROXY_SHARED_SECRET'], message: 'ORIGIN_PROXY_SHARED_SECRET is required in production' });
  }
  if (env.NODE_ENV === 'production' && !env.CLAIM_TOKEN_PEPPER) {
    context.addIssue({ code: 'custom', path: ['CLAIM_TOKEN_PEPPER'], message: 'CLAIM_TOKEN_PEPPER is required in production' });
  }
  if (env.DEV_SESSION_MINT_ENABLED === '1' && !env.DEV_SESSION_MINT_SECRET) {
    context.addIssue({ code: 'custom', path: ['DEV_SESSION_MINT_SECRET'], message: 'DEV_SESSION_MINT_SECRET is required when development session minting is enabled' });
  }
  for (const [urlKey, tokenKey] of [
    ['BOOKING_REQUEST_WEBHOOK_URL', 'BOOKING_REQUEST_WEBHOOK_TOKEN'],
    ['CHECKIN_REQUEST_WEBHOOK_URL', 'CHECKIN_REQUEST_WEBHOOK_TOKEN'],
  ]) {
    const url = env[urlKey];
    if (url && !env[tokenKey]) {
      context.addIssue({ code: 'custom', path: [tokenKey], message: `${tokenKey} is required when ${urlKey} is configured` });
    }
    if (env.NODE_ENV === 'production' && url && new URL(url).protocol !== 'https:') {
      context.addIssue({ code: 'custom', path: [urlKey], message: `${urlKey} must use HTTPS in production` });
    }
  }
  if (env.ALERT_WEBHOOK_REQUIRED === '1' && !env.ALERT_WEBHOOK_URL) {
    context.addIssue({ code: 'custom', path: ['ALERT_WEBHOOK_URL'], message: 'ALERT_WEBHOOK_URL is required when ALERT_WEBHOOK_REQUIRED=1' });
  }
  if (env.NODE_ENV === 'production' && env.ALERT_WEBHOOK_URL && new URL(env.ALERT_WEBHOOK_URL).protocol !== 'https:') {
    context.addIssue({ code: 'custom', path: ['ALERT_WEBHOOK_URL'], message: 'ALERT_WEBHOOK_URL must use HTTPS in production' });
  }
  if (env.RATE_LIMIT_BACKEND === 'redis' && (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN)) {
    context.addIssue({ code: 'custom', path: ['RATE_LIMIT_BACKEND'], message: 'Redis rate limiting requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN' });
  }
  if (env.NODE_ENV === 'production' && env.RATE_LIMIT_BACKEND !== 'redis') {
    context.addIssue({ code: 'custom', path: ['RATE_LIMIT_BACKEND'], message: 'RATE_LIMIT_BACKEND=redis is required in production; process-local rate limiting is not distributed' });
  }
  if (env.NODE_ENV === 'production' && env.UPSTASH_REDIS_REST_URL) {
    const redisUrl = new URL(env.UPSTASH_REDIS_REST_URL);
    if (redisUrl.protocol !== 'https:') {
      context.addIssue({ code: 'custom', path: ['UPSTASH_REDIS_REST_URL'], message: 'UPSTASH_REDIS_REST_URL must use HTTPS in production' });
    }
  }
});
