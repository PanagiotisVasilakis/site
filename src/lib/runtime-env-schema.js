import { z } from 'zod';
import {
  ACTIVE_RUNTIME_CREDENTIAL_NAMES,
  hasRepeatedPattern,
  runtimeCredentialIssue,
} from './runtime-credentials.js';

const optionalEnv = (schema) => z.preprocess(
  (value) => value === '' ? undefined : value,
  schema.optional(),
);

// Zod 4 still runs this refine after the `z.url()` check fails, so an empty or unparsable
// value must return false here instead of throwing a bare TypeError.
function isPostgresUrl(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'postgresql:' || protocol === 'postgres:';
  } catch {
    return false;
  }
}

function isTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isOriginProxySecret(value) {
  return /^[0-9a-fA-F]{64}$/u.test(value)
    && !hasRepeatedPattern(value)
    && !/^(?:deadbeef|changeme|placeholder)/iu.test(value);
}

// The Airbnb calendar export URL carries a secret token in its query string,
// so validation messages must never echo the value.
const AIRBNB_CALENDAR_HOSTS = new Set(['www.airbnb.com', 'airbnb.com', 'www.airbnb.gr', 'airbnb.gr']);
const AIRBNB_CALENDAR_PATH = /^\/calendar\/ical\/\d+\.ics$/;

/**
 * An https Airbnb calendar export URL: no userinfo, default port, `/calendar/ical/<listing>.ics`.
 * @param {string} value
 * @returns {boolean}
 */
export function isAirbnbCalendarUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:'
    && url.username === ''
    && url.password === ''
    && url.port === ''
    && AIRBNB_CALENDAR_HOSTS.has(url.hostname)
    && AIRBNB_CALENDAR_PATH.test(url.pathname);
}

export const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),

  DATABASE_URL: z.url().min(1, 'DATABASE_URL is required').refine(isPostgresUrl, 'DATABASE_URL must use postgres or postgresql'),

  ADMIN_JWT_SECRET: optionalEnv(z.string()),
  ADMIN_DASH_SECRET: optionalEnv(z.string()),
  GUEST_JWT_SECRET: optionalEnv(z.string()),
  SECURITY_PEPPER: z.string().min(16, 'SECURITY_PEPPER must be at least 16 characters'),
  CLAIM_TOKEN_PEPPER: z.string().min(32, 'CLAIM_TOKEN_PEPPER must be at least 32 characters'),
  GUEST_WIFI_NETWORK: z.string().min(1, 'GUEST_WIFI_NETWORK is required'),
  GUEST_WIFI_PASSWORD: z.string().min(8, 'GUEST_WIFI_PASSWORD must be at least 8 characters'),
  PROPERTY_TIME_ZONE: z.string().refine(isTimeZone, 'PROPERTY_TIME_ZONE must be a valid IANA time zone').default('Europe/Athens'),


  ALLOWED_ORIGINS: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: optionalEnv(z.url()),
  BUILD_SITE_URL: optionalEnv(z.url()),
  ORIGIN_PROXY_SHARED_SECRET: optionalEnv(z.string().refine(
    isOriginProxySecret,
    'ORIGIN_PROXY_SHARED_SECRET must be a non-placeholder 64-character hexadecimal secret',
  )),

  CHECKIN_REQUEST_WEBHOOK_URL: optionalEnv(z.url()),
  CHECKIN_REQUEST_WEBHOOK_TOKEN: optionalEnv(z.string().min(20)),
  ALERT_WEBHOOK_URL: optionalEnv(z.url()),
  ALERT_WEBHOOK_TOKEN: optionalEnv(z.string().min(20)),
  ALERT_WEBHOOK_REQUIRED: z.enum(['0', '1']).optional().default('0'),
  AIRBNB_ICAL_URL: optionalEnv(z.string().refine(
    isAirbnbCalendarUrl,
    'AIRBNB_ICAL_URL must be an https Airbnb calendar export URL (/calendar/ical/<listing id>.ics)',
  )),
  // Public CARTO basemaps key: sent to browsers in tile URLs, but never logged.
  CARTO_BASEMAPS_KEY: optionalEnv(z.string().regex(
    /^[A-Za-z0-9_-]{8,128}$/,
    'CARTO_BASEMAPS_KEY must be 8-128 characters of letters, digits, "_" or "-"',
  )),

  PRISMA_LOG_LIFECYCLE: optionalEnv(z.enum(['0', '1'])),
  LOG_LEVEL: optionalEnv(z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])),
  LOG_CONSOLE: optionalEnv(z.enum(['true', 'false'])),
  LOG_STRUCTURED: optionalEnv(z.enum(['true', 'false'])),
  LOG_MAX_METADATA_SIZE: optionalEnv(z.string().regex(/^\d+$/)),

}).superRefine((env, context) => {
  if (env.NODE_ENV === 'production') {
    for (const name of ACTIVE_RUNTIME_CREDENTIAL_NAMES) {
      const issue = runtimeCredentialIssue(name, env[name]);
      if (issue) {
        context.addIssue({ code: 'custom', path: [name], message: `${name} ${issue}` });
      }
    }
    const credentialOwners = new Map();
    for (const name of ACTIVE_RUNTIME_CREDENTIAL_NAMES) {
      const value = env[name];
      if (!value) continue;
      const previous = credentialOwners.get(value);
      if (previous) {
        context.addIssue({
          code: 'custom',
          path: [name],
          message: `${name} must differ from ${previous}`,
        });
      } else {
        credentialOwners.set(value, name);
      }
    }
  }
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
  for (const [urlKey, tokenKey] of [
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
});
