import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseEnv } from '@/lib/env';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/site_dev',
  ADMIN_JWT_SECRET: 'a'.repeat(32),
  ADMIN_DASH_SECRET: 'a'.repeat(20),
  GUEST_JWT_SECRET: 'a'.repeat(32),
  SECURITY_ENC_KEY_HEX: 'a'.repeat(64),
  SECURITY_PEPPER: 'a'.repeat(16),
  SESSION_SECRET: 'a'.repeat(32),
  GUEST_WIFI_NETWORK: 'network',
  GUEST_WIFI_PASSWORD: 'password',
};

const productionBase = {
  ...base,
  NODE_ENV: 'production',
  CLAIM_TOKEN_PEPPER: 'a'.repeat(32),
  TRUST_PROXY_MODE: 'hops',
  TRUST_PROXY_HOPS: '1',
  NEXT_PUBLIC_SITE_URL: 'https://example.test',
};

describe('environment contract', () => {
  it('treats blank optional integration variables as unset', () => {
    expect(parseEnv({
      ...base,
      CLIENT_IP_HEADER: '',
      BOOKING_REQUEST_WEBHOOK_URL: '',
      BOOKING_REQUEST_WEBHOOK_TOKEN: '',
      RATE_LIMIT_BACKEND: '',
    })).toMatchObject({
      CLIENT_IP_HEADER: undefined,
      BOOKING_REQUEST_WEBHOOK_URL: undefined,
      RATE_LIMIT_BACKEND: undefined,
    });
  });

  it('requires an authenticated webhook when guest PII is delivered', () => {
    expect(() => parseEnv({
      ...base,
      BOOKING_REQUEST_WEBHOOK_URL: 'https://hooks.example.test/bookings',
    })).toThrow();
  });

  it('requires an explicit trusted proxy topology in production', () => {
    expect(() => parseEnv({
      ...base,
      NODE_ENV: 'production',
      CLAIM_TOKEN_PEPPER: 'a'.repeat(32),
      TRUST_PROXY_MODE: 'none',
    })).toThrow();
  });

  it('restricts database URLs and configured API keys to their runtime formats', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: 'https://example.test/database' })).toThrow();
    expect(() => parseEnv({ ...base, VALID_API_KEYS: 'short' })).toThrow();
    expect(parseEnv({ ...base, VALID_API_KEYS: 'a'.repeat(32) }).VALID_API_KEYS).toBe('a'.repeat(32));
  });

  it('requires an HTTPS public origin in production, with an explicit CI loopback exception', () => {
    expect(() => parseEnv({ ...productionBase, NEXT_PUBLIC_SITE_URL: 'http://example.test' })).toThrow();
    expect(parseEnv({
      ...productionBase,
      CI: 'true',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    }).NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000');
  });

  it('rejects wildcard and non-origin CORS entries in production', () => {
    expect(() => parseEnv({ ...productionBase, ALLOWED_ORIGINS: '*' })).toThrow();
    expect(() => parseEnv({ ...productionBase, ALLOWED_ORIGINS: 'https://example.test/path' })).toThrow();
  });

  it('rejects a runtime origin that differs from the container build origin', () => {
    expect(() => parseEnv({
      ...productionBase,
      BUILD_SITE_URL: 'https://compiled.example.test',
    })).toThrow();
  });

  it('exits before importing the standalone server when production configuration is invalid', () => {
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/start-standalone.mjs'), resolve('.next/standalone/server.js')],
      {
        encoding: 'utf8',
        env: { NODE_ENV: 'production', PATH: process.env.PATH },
      },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toContain('Environment validation failed; server was not started');
    expect(result.stdout).not.toContain('Next.js');
    expect(result.stdout).not.toContain('Ready');
  });
});
