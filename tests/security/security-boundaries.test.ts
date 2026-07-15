import type { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashSensitive, verifySensitive } from '@/lib/crypto';
import { getClientIp } from '@/lib/net/getClientIp';
import { privacyHmac } from '@/lib/privacyHash';
import { isSensitiveFieldName, redactSensitiveText } from '@/lib/redaction';
import { runtimeEnvSchema } from '@/lib/runtime-env-schema.js';

const requiredEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/guest_guide',
  ADMIN_JWT_SECRET: 'a'.repeat(32),
  ADMIN_DASH_SECRET: 'd'.repeat(20),
  GUEST_JWT_SECRET: 'g'.repeat(32),
  SECURITY_ENC_KEY_HEX: '1'.repeat(64),
  SECURITY_PEPPER: 'p'.repeat(16),
  SESSION_SECRET: 's'.repeat(32),
  GUEST_WIFI_NETWORK: 'Guest WiFi',
  GUEST_WIFI_PASSWORD: 'wifi-password',
};

function productionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ...requiredEnv,
    NODE_ENV: 'production',
    NEXT_PUBLIC_SITE_URL: 'https://guest.example',
    CLAIM_TOKEN_PEPPER: 'c'.repeat(32),
    TRUST_PROXY_MODE: 'hops',
    TRUST_PROXY_HOPS: '1',
    RATE_LIMIT_BACKEND: 'redis',
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'r'.repeat(20),
    ...overrides,
  };
}

describe('runtime environment fail-closed policy', () => {
  it('accepts a minimal development environment and applies safe defaults', () => {
    const result = runtimeEnvSchema.parse(requiredEnv);
    expect(result).toEqual(expect.objectContaining({
      NODE_ENV: 'development',
      PROPERTY_TIME_ZONE: 'Europe/Athens',
      TRUST_PROXY_MODE: 'none',
      TRUST_PROXY_HOPS: '0',
    }));
  });

  it('accepts a complete HTTPS production environment', () => {
    expect(runtimeEnvSchema.safeParse(productionEnv()).success).toBe(true);
  });

  it.each([
    ['non-Postgres database URL', { DATABASE_URL: 'https://database.example/db' }, 'DATABASE_URL'],
    ['short JWT secret', { ADMIN_JWT_SECRET: 'short' }, 'ADMIN_JWT_SECRET'],
    ['invalid encryption key', { SECURITY_ENC_KEY_HEX: 'not-hex' }, 'SECURITY_ENC_KEY_HEX'],
    ['invalid time zone', { PROPERTY_TIME_ZONE: 'Mars/Olympus' }, 'PROPERTY_TIME_ZONE'],
    ['test runtime mode', { NODE_ENV: 'test' }, 'NODE_ENV'],
  ])('rejects %s', (_label, overrides, expectedPath) => {
    const result = runtimeEnvSchema.safeParse({ ...requiredEnv, ...overrides });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(({ path }) => path[0] === expectedPath)).toBe(true);
  });

  it.each([
    ['missing public URL', { NEXT_PUBLIC_SITE_URL: undefined }, 'NEXT_PUBLIC_SITE_URL'],
    ['HTTP public URL', { NEXT_PUBLIC_SITE_URL: 'http://guest.example' }, 'NEXT_PUBLIC_SITE_URL'],
    ['missing claim pepper', { CLAIM_TOKEN_PEPPER: undefined }, 'CLAIM_TOKEN_PEPPER'],
    ['untrusted proxy topology', { TRUST_PROXY_MODE: 'none', TRUST_PROXY_HOPS: '0' }, 'TRUST_PROXY_MODE'],
    ['process-local rate limiting', { RATE_LIMIT_BACKEND: undefined }, 'RATE_LIMIT_BACKEND'],
    ['insecure Redis endpoint', { UPSTASH_REDIS_REST_URL: 'http://redis.example' }, 'UPSTASH_REDIS_REST_URL'],
  ])('rejects production configuration with %s', (_label, overrides, expectedPath) => {
    const result = runtimeEnvSchema.safeParse(productionEnv(overrides));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(({ path }) => path[0] === expectedPath)).toBe(true);
  });

  it('requires header selection and positive hops for header proxy mode', () => {
    const missingHeader = runtimeEnvSchema.safeParse({
      ...requiredEnv,
      TRUST_PROXY_MODE: 'header',
      TRUST_PROXY_HOPS: '0',
    });
    expect(missingHeader.success).toBe(false);
    if (!missingHeader.success) {
      expect(missingHeader.error.issues.map(({ path }) => path[0])).toEqual(
        expect.arrayContaining(['TRUST_PROXY_HOPS', 'CLIENT_IP_HEADER']),
      );
    }
  });

  it('requires webhook tokens and HTTPS endpoints in production', () => {
    const missingToken = runtimeEnvSchema.safeParse({
      ...requiredEnv,
      BOOKING_REQUEST_WEBHOOK_URL: 'https://hooks.example/booking',
    });
    expect(missingToken.success).toBe(false);
    const insecure = runtimeEnvSchema.safeParse(productionEnv({
      BOOKING_REQUEST_WEBHOOK_URL: 'http://hooks.example/booking',
      BOOKING_REQUEST_WEBHOOK_TOKEN: 't'.repeat(20),
    }));
    expect(insecure.success).toBe(false);
  });

  it('rejects duplicate encryption rotation keys and compiled URL drift', () => {
    const currentKey = 'f'.repeat(64);
    const result = runtimeEnvSchema.safeParse({
      ...productionEnv({
        SECURITY_ENC_KEY_HEX: currentKey,
        SECURITY_ENC_KEY_HEX_PREVIOUS: currentKey,
        BUILD_SITE_URL: 'https://compiled.example',
      }),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ path }) => path[0])).toEqual(
        expect.arrayContaining(['SECURITY_ENC_KEY_HEX_PREVIOUS', 'NEXT_PUBLIC_SITE_URL']),
      );
    }
  });

  it('validates API key lists and production CORS origins', () => {
    expect(runtimeEnvSchema.safeParse({ ...requiredEnv, INTERNAL_API_KEYS: `${'A'.repeat(32)},${'b'.repeat(40)}` }).success).toBe(true);
    expect(runtimeEnvSchema.safeParse({ ...requiredEnv, INTERNAL_API_KEYS: 'short,key!' }).success).toBe(false);
    expect(runtimeEnvSchema.safeParse(productionEnv({ ALLOWED_ORIGINS: 'http://guest.example' })).success).toBe(false);
  });
});

describe('credential hashing and privacy-safe logging', () => {
  it('uses a unique salt and verifies only the original value', () => {
    const first = hashSensitive('guest-secret');
    const second = hashSensitive('guest-secret');
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    expect(verifySensitive('guest-secret', first.salt, first.hash)).toBe(true);
    expect(verifySensitive('wrong-secret', first.salt, first.hash)).toBe(false);
    expect(verifySensitive('guest-secret', first.salt, 'malformed')).toBe(false);
  });

  it('produces context-separated deterministic privacy digests', () => {
    expect(privacyHmac('203.0.113.10', 'ip:v1')).toBe(privacyHmac('203.0.113.10', 'ip:v1'));
    expect(privacyHmac('203.0.113.10', 'ip:v1')).not.toBe(privacyHmac('203.0.113.10', 'device:v1'));
    expect(privacyHmac('203.0.113.10', 'ip:v1')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('redacts email, phone and token shapes without corrupting ordinary dates', () => {
    const token = `${'a'.repeat(24)}.${'b'.repeat(24)}.signature`;
    expect(redactSensitiveText(`guest@example.com +30 690 000 0000 ${token}`)).toBe(
      '[REDACTED_EMAIL] [REDACTED_PHONE] [REDACTED_TOKEN]',
    );
    expect(redactSensitiveText('Deployment 2026-07-15')).toBe('Deployment 2026-07-15');
    expect(redactSensitiveText('x'.repeat(100), 20)).toHaveLength(20);
  });

  it.each([
    ['authorization', true],
    ['user-agent', true],
    ['guest_password_hash', true],
    ['status', false],
  ])('classifies sensitive field %s', (field, expected) => {
    expect(isSensitiveFieldName(field)).toBe(expected);
  });
});

describe('trusted proxy IP extraction', () => {
  afterEach(() => vi.unstubAllEnvs());

  function request(headers: Record<string, string>): NextRequest {
    return {
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    } as unknown as NextRequest;
  }

  it('ignores all forwarding data when proxy trust is disabled', () => {
    expect(getClientIp(request({ 'x-forwarded-for': '203.0.113.10' }), { trustProxy: false })).toBe('unknown');
  });

  it('selects the client address using the configured trusted-hop count', () => {
    expect(getClientIp(request({
      'x-forwarded-for': '203.0.113.10, 198.51.100.20, 192.0.2.30',
    }), { trustProxy: true, trustedHops: 2 })).toBe('198.51.100.20');
  });

  it('accepts only allowlisted direct client-IP headers', () => {
    expect(getClientIp(request({ 'cf-connecting-ip': '203.0.113.195' }), {
      trustProxy: true,
      trustedHops: 1,
      clientIpHeader: 'cf-connecting-ip',
    })).toBe('203.0.113.195');
    expect(getClientIp(request({ 'x-client-ip': '203.0.113.195' }), {
      trustProxy: true,
      trustedHops: 1,
      clientIpHeader: 'x-client-ip',
    })).toBe('unknown');
  });

  it('normalizes IPv4-mapped IPv6 and rejects malformed addresses', () => {
    expect(getClientIp(request({ 'x-real-ip': '::ffff:203.0.113.10' }), {
      trustProxy: true,
      trustedHops: 1,
      clientIpHeader: 'x-real-ip',
    })).toBe('203.0.113.10');
    expect(getClientIp(request({ 'x-real-ip': 'attacker-controlled-value' }), {
      trustProxy: true,
      trustedHops: 1,
      clientIpHeader: 'x-real-ip',
    })).toBe('unknown');
  });
});
