import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashSensitive, verifySensitive } from '@/lib/crypto';
import { requirePepper } from '@/lib/pepper';
import { privacyHmac } from '@/lib/privacyHash';
import { isSensitiveFieldName, redactSensitiveText } from '@/lib/redaction';
import { runtimeEnvSchema } from '@/lib/runtime-env-schema.js';

const requiredEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/guest_guide',
  SECURITY_PEPPER: 'p'.repeat(16),
  CLAIM_TOKEN_PEPPER: 'c'.repeat(32),
  GUEST_WIFI_NETWORK: 'Guest WiFi',
  GUEST_WIFI_PASSWORD: 'wifi-password',
};

function syntheticCredential(purpose: string) {
  return createHash('sha256')
    .update(`security-boundary-isolated-fixture:${purpose}`, 'utf8')
    .digest('base64url');
}

function productionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ...requiredEnv,
    NODE_ENV: 'production',
    ADMIN_JWT_SECRET: syntheticCredential('admin-jwt'),
    ADMIN_DASH_SECRET: syntheticCredential('admin-dashboard'),
    GUEST_JWT_SECRET: syntheticCredential('guest-jwt'),
    SECURITY_PEPPER: syntheticCredential('security-pepper'),
    CLAIM_TOKEN_PEPPER: syntheticCredential('claim-token-pepper'),
    NEXT_PUBLIC_SITE_URL: 'https://guest.example',
    ORIGIN_PROXY_SHARED_SECRET: '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2',
    ...overrides,
  };
}

describe('runtime environment fail-closed policy', () => {
  it('accepts a minimal development environment and applies safe defaults', () => {
    const result = runtimeEnvSchema.parse(requiredEnv);
    expect(result).toEqual(expect.objectContaining({
      NODE_ENV: 'development',
    }));
    expect(result).not.toHaveProperty('ADMIN_JWT_SECRET');
    expect(result).not.toHaveProperty('GUEST_JWT_SECRET');
    expect(result).not.toHaveProperty('ADMIN_DASH_SECRET');
  });

  it('treats an empty NEXT_PUBLIC_SITE_URL line in development as unset', () => {
    const result = runtimeEnvSchema.safeParse({ ...requiredEnv, NEXT_PUBLIC_SITE_URL: '' });
    expect(result.success).toBe(true);
    expect(result.data?.NEXT_PUBLIC_SITE_URL).toBeUndefined();
  });

  it('accepts a complete HTTPS production environment without external limiter variables', () => {
    expect(runtimeEnvSchema.safeParse(productionEnv()).success).toBe(true);
  });

  it.each([
    ['non-Postgres database URL', { DATABASE_URL: 'https://database.example/db' }, 'DATABASE_URL'],
    ['empty database URL', { DATABASE_URL: '' }, 'DATABASE_URL'],
    ['development without a claim-token pepper', { CLAIM_TOKEN_PEPPER: undefined }, 'CLAIM_TOKEN_PEPPER'],
    ['test runtime mode', { NODE_ENV: 'test' }, 'NODE_ENV'],
  ])('rejects %s', (_label, overrides, expectedPath) => {
    const result = runtimeEnvSchema.safeParse({ ...requiredEnv, ...overrides });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(({ path }) => path[0] === expectedPath)).toBe(true);
  });

  it.each([
    ['missing admin JWT credential', { ADMIN_JWT_SECRET: undefined }, 'ADMIN_JWT_SECRET'],
    ['missing guest JWT credential', { GUEST_JWT_SECRET: undefined }, 'GUEST_JWT_SECRET'],
    ['missing dashboard credential', { ADMIN_DASH_SECRET: undefined }, 'ADMIN_DASH_SECRET'],
    ['short credential', { ADMIN_JWT_SECRET: 'short' }, 'ADMIN_JWT_SECRET'],
    [
      'placeholder credential',
      { ADMIN_DASH_SECRET: 'replace-me-with-a-production-dashboard-credential' },
      'ADMIN_DASH_SECRET',
    ],
    [
      'malformed credential',
      { GUEST_JWT_SECRET: `${syntheticCredential('malformed')} ` },
      'GUEST_JWT_SECRET',
    ],
    ['patterned credential', { ADMIN_JWT_SECRET: 'a1'.repeat(32) }, 'ADMIN_JWT_SECRET'],
    ['missing public URL', { NEXT_PUBLIC_SITE_URL: undefined }, 'NEXT_PUBLIC_SITE_URL'],
    ['HTTP public URL', { NEXT_PUBLIC_SITE_URL: 'http://guest.example' }, 'NEXT_PUBLIC_SITE_URL'],
    ['missing claim pepper', { CLAIM_TOKEN_PEPPER: undefined }, 'CLAIM_TOKEN_PEPPER'],
    ['empty security pepper', { SECURITY_PEPPER: '' }, 'SECURITY_PEPPER'],
    ['missing origin attestation secret', { ORIGIN_PROXY_SHARED_SECRET: undefined }, 'ORIGIN_PROXY_SHARED_SECRET'],
    ['weak origin attestation secret', { ORIGIN_PROXY_SHARED_SECRET: 'a'.repeat(64) }, 'ORIGIN_PROXY_SHARED_SECRET'],
  ])('rejects production configuration with %s', (_label, overrides, expectedPath) => {
    const result = runtimeEnvSchema.safeParse(productionEnv(overrides));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(({ path }) => path[0] === expectedPath)).toBe(true);
  });

  it('rejects malformed origin attestation secrets even outside production', () => {
    const result = runtimeEnvSchema.safeParse({
      ...requiredEnv,
      ORIGIN_PROXY_SHARED_SECRET: 'not-a-32-byte-hex-secret',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path[0]).toBe('ORIGIN_PROXY_SHARED_SECRET');
  });

  it('ignores a leftover webhook variable of the removed booking-request form', () => {
    const result = runtimeEnvSchema.safeParse(productionEnv({
      BOOKING_REQUEST_WEBHOOK_URL: 'http://hooks.example/booking',
    }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('BOOKING_REQUEST_WEBHOOK_URL');
  });

  it.each([
    [
      'required alert delivery without an endpoint',
      { ALERT_WEBHOOK_REQUIRED: '1', ALERT_WEBHOOK_URL: undefined },
      'ALERT_WEBHOOK_URL',
    ],
    [
      'an insecure production alert endpoint',
      { ALERT_WEBHOOK_URL: 'http://alerts.example', ALERT_WEBHOOK_TOKEN: 'a'.repeat(20) },
      'ALERT_WEBHOOK_URL',
    ],
  ] as const)('rejects %s', (_label, overrides, expectedPath) => {
    const result = runtimeEnvSchema.safeParse(productionEnv(overrides));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(({ path }) => path[0] === expectedPath)).toBe(true);
    }
  });

  it.each([
    ['admin and guest', 'GUEST_JWT_SECRET', 'ADMIN_JWT_SECRET'],
    ['admin and dashboard', 'ADMIN_DASH_SECRET', 'ADMIN_JWT_SECRET'],
  ] as const)('rejects identical %s credentials', (_label, target, source) => {
    const baseline = productionEnv();
    const result = runtimeEnvSchema.safeParse({
      ...baseline,
      [target]: baseline[source],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(({ path }) => path[0] === target)).toBe(true);
    }
  });

  it('rejects compiled URL drift', () => {
    const result = runtimeEnvSchema.safeParse(productionEnv({
      BUILD_SITE_URL: 'https://compiled.example',
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(({ path }) => path[0] === 'NEXT_PUBLIC_SITE_URL')).toBe(true);
    }
  });

  it('strips retired credential names instead of restoring them to the contract', () => {
    const result = runtimeEnvSchema.parse({
      ...requiredEnv,
      JWT_SECRET: 'retired',
      SESSION_SECRET: 'retired',
      SECURITY_ENC_KEY_HEX: 'retired',
      SECURITY_ENC_KEY_HEX_PREVIOUS: 'retired',
    });
    expect(result).not.toHaveProperty('JWT_SECRET');
    expect(result).not.toHaveProperty('SESSION_SECRET');
    expect(result).not.toHaveProperty('SECURITY_ENC_KEY_HEX');
    expect(result).not.toHaveProperty('SECURITY_ENC_KEY_HEX_PREVIOUS');
  });

  it('validates production CORS origins', () => {
    expect(runtimeEnvSchema.safeParse(productionEnv({ ALLOWED_ORIGINS: 'http://guest.example' })).success).toBe(false);
  });

  it.each([
    ['plain http', 'http://ical.booking.com/v1/export?t=fixture'],
    ['a non-Booking.com host', 'https://calendar.example/v1/export?t=fixture'],
    ['a look-alike Booking.com host', 'https://ical.booking.com.evil.example/v1/export?t=fixture'],
    ['the public Booking.com host', 'https://www.booking.com/v1/export?t=fixture'],
    ['userinfo', 'https://user:pass@ical.booking.com/v1/export?t=fixture'],
    ['a non-default port', 'https://ical.booking.com:8443/v1/export?t=fixture'],
    ['a longer path', 'https://ical.booking.com/v1/export/extra?t=fixture'],
    ['another path', 'https://ical.booking.com/v1/other?t=fixture'],
    ['the older host with the current path', 'https://admin.booking.com/v1/export?t=fixture'],
    ['the current host with the older path', 'https://ical.booking.com/hotel/hoteladmin/ical.html?t=fixture'],
    ['no query (no token)', 'https://ical.booking.com/v1/export'],
    ['a trailing slash after the export path', 'https://ical.booking.com/v1/export/?t=fixture'],
    ['a trailing slash after the older export path', 'https://admin.booking.com/hotel/hoteladmin/ical.html/?t=fixture'],
    ['a username without a password', 'https://user@ical.booking.com/v1/export?t=fixture'],
    ['a password without a username', 'https://:pass@ical.booking.com/v1/export?t=fixture'],
    ['a trailing dot after the host', 'https://ical.booking.com./v1/export?t=fixture'],
    ['a bare question mark (empty query)', 'https://ical.booking.com/v1/export?'],
    ['a host that only ends in booking.com', 'https://evilbooking.com/v1/export?t=fixture'],
    ['an unparsable value', 'booking calendar t=fixture'],
  ])('rejects a BOOKING_ICAL_URL with %s without echoing it', (_label, value) => {
    const result = runtimeEnvSchema.safeParse(productionEnv({ BOOKING_ICAL_URL: value }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ path }) => path[0])).toEqual(['BOOKING_ICAL_URL']);
      expect(JSON.stringify(result.error.issues)).not.toContain('t=fixture');
    }
  });

  it.each([
    'https://ical.booking.com/v1/export?t=fixture',
    'https://ical.booking.com:443/v1/export?t=fixture&lang=en',
  ])('accepts the Booking.com calendar export URL %s', (value) => {
    const result = runtimeEnvSchema.safeParse(productionEnv({ BOOKING_ICAL_URL: value }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.BOOKING_ICAL_URL).toBe(value);
  });

  it.each([
    ['empty', ''],
    ['unset', undefined],
  ])('treats an %s BOOKING_ICAL_URL as not configured', (_label, value) => {
    const result = runtimeEnvSchema.safeParse(productionEnv({ BOOKING_ICAL_URL: value }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.BOOKING_ICAL_URL).toBeUndefined();
  });

  it.each(['fixtureCartoKey_0123', 'abcd-EFGH', 'a'.repeat(128)])('accepts the CARTO basemaps key format %#', (value) => {
    const result = runtimeEnvSchema.safeParse(productionEnv({ CARTO_BASEMAPS_KEY: value }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.CARTO_BASEMAPS_KEY).toBe(value);
  });

  it.each([
    ['URL-significant characters', 'fixtureKey&x=secret'],
    ['too short a value', 'secret7'],
    ['too long a value', `secret${'a'.repeat(123)}`],
  ])('rejects a CARTO_BASEMAPS_KEY with %s without echoing it', (_label, value) => {
    const result = runtimeEnvSchema.safeParse(productionEnv({ CARTO_BASEMAPS_KEY: value }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ path }) => path[0])).toEqual(['CARTO_BASEMAPS_KEY']);
      expect(JSON.stringify(result.error.issues)).not.toContain('secret');
    }
  });

  it('treats an empty CARTO_BASEMAPS_KEY as not configured', () => {
    const result = runtimeEnvSchema.safeParse(productionEnv({ CARTO_BASEMAPS_KEY: '' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.CARTO_BASEMAPS_KEY).toBeUndefined();
  });

  it.each([
    ['NEXT_PUBLIC_SITE_URL', 'guide.example/?token=fixture', {}],
    [
      'CHECKIN_REQUEST_WEBHOOK_URL',
      'hooks.example/check-in?token=fixture',
      { CHECKIN_REQUEST_WEBHOOK_TOKEN: 't'.repeat(20) },
    ],
    ['ALERT_WEBHOOK_URL', 'alerts.example/hook?token=fixture', { ALERT_WEBHOOK_TOKEN: 'a'.repeat(20) }],
  ] as const)('reports an unparsable %s as an issue next to the others without echoing it', (key, value, extra) => {
    const result = runtimeEnvSchema.safeParse(productionEnv({ ...extra, [key]: value, GUEST_WIFI_PASSWORD: 'short' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map(({ path }) => path[0]);
      expect(paths).toContain(key);
      expect(paths).toContain('GUEST_WIFI_PASSWORD');
      expect(JSON.stringify(result.error.issues)).not.toContain('token=fixture');
    }
  });

  it('keeps the token and HTTPS messages of an insecure check-in webhook', () => {
    const result = runtimeEnvSchema.safeParse(productionEnv({
      CHECKIN_REQUEST_WEBHOOK_URL: 'http://hooks.example/check-in',
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ path, message }) => [path[0], message])).toEqual([
        [
          'CHECKIN_REQUEST_WEBHOOK_TOKEN',
          'CHECKIN_REQUEST_WEBHOOK_TOKEN is required when CHECKIN_REQUEST_WEBHOOK_URL is configured',
        ],
        ['CHECKIN_REQUEST_WEBHOOK_URL', 'CHECKIN_REQUEST_WEBHOOK_URL must use HTTPS in production'],
      ]);
    }
  });

  it.each(['SECURITY_PEPPER', 'CLAIM_TOKEN_PEPPER'])(
    'rejects the .env.example value of %s in production without echoing it',
    (name) => {
      const example = readFileSync('.env.example', 'utf8')
        .split('\n')
        .find((line) => line.startsWith(`${name}=`))
        ?.slice(name.length + 1) ?? '';
      expect(example).not.toBe('');
      const result = runtimeEnvSchema.safeParse(productionEnv({ [name]: example }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map(({ path }) => path[0])).toEqual([name]);
        expect(JSON.stringify(result.error.issues)).not.toContain(example);
      }
    },
  );

  const pepperSuffix = syntheticCredential('pepper-suffix');

  it.each([
    ['a repeated character', 'a'.repeat(32)],
    ['a repeated block', 'k3Zq9xTv'.repeat(4)],
    ['the word changeme', `ChangeMe-${pepperSuffix}`],
    ['the word placeholder', `${pepperSuffix}-placeholder`],
    ['the word example', `${pepperSuffix}.EXAMPLE`],
  ])('rejects a production pepper with %s without echoing it', (_label, value) => {
    for (const name of ['SECURITY_PEPPER', 'CLAIM_TOKEN_PEPPER']) {
      const result = runtimeEnvSchema.safeParse(productionEnv({ [name]: value }));
      expect(result.success, name).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map(({ path }) => path[0]), name).toEqual([name]);
        expect(JSON.stringify(result.error.issues), name).not.toContain(value);
      }
    }
  });

  it.each([
    ['SECURITY_PEPPER', 'ADMIN_JWT_SECRET'],
    ['SECURITY_PEPPER', 'ADMIN_DASH_SECRET'],
    ['CLAIM_TOKEN_PEPPER', 'GUEST_JWT_SECRET'],
  ] as const)('rejects %s that reuses the value of %s', (pepper, credential) => {
    const baseline = productionEnv();
    const result = runtimeEnvSchema.safeParse({ ...baseline, [pepper]: baseline[credential] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ path }) => path[0])).toEqual([pepper]);
      expect(JSON.stringify(result.error.issues)).not.toContain(baseline[credential]);
    }
  });

  it('accepts a synthetic production environment and hexadecimal peppers', () => {
    expect(runtimeEnvSchema.safeParse(productionEnv({
      SECURITY_PEPPER: 'release-only-security-pepper',
      CLAIM_TOKEN_PEPPER: 'release-only-claim-token-pepper-0000',
      BUILD_SITE_URL: 'https://guest.example',
    })).success).toBe(true);
    const hex = (purpose: string) => createHash('sha256').update(purpose, 'utf8').digest('hex');
    expect(runtimeEnvSchema.safeParse(productionEnv({
      SECURITY_PEPPER: hex('security-pepper'),
      CLAIM_TOKEN_PEPPER: hex('claim-token-pepper'),
    })).success).toBe(true);
  });

  it('rejects LOG_LEVEL=fatal, which the logger never emits, and accepts the levels it knows', () => {
    const fatal = runtimeEnvSchema.safeParse(productionEnv({ LOG_LEVEL: 'fatal' }));
    expect(fatal.success).toBe(false);
    if (!fatal.success) expect(fatal.error.issues.map(({ path }) => path[0])).toEqual(['LOG_LEVEL']);
    for (const level of ['trace', 'debug', 'info', 'warn', 'error']) {
      expect(runtimeEnvSchema.safeParse(productionEnv({ LOG_LEVEL: level })).success, level).toBe(true);
    }
  });

  it('enforces the standalone startup credential contract (missing, invalid, identical exit 78; valid exits 0 without leaking credentials)', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'runtime-credential-contract-'));
    try {
      const serverFixture = path.join(root, 'server-fixture.mjs');
      writeFileSync(serverFixture, 'export const started = true;\n', { mode: 0o600 });

      const valid = productionEnv({
        DATABASE_URL: 'postgresql://release:synthetic@127.0.0.1:1/release_build',
        DIRECT_URL: 'postgresql://release:synthetic@127.0.0.1:1/release_build',
        SECURITY_PEPPER: 'release-only-security-pepper',
        CLAIM_TOKEN_PEPPER: 'release-only-claim-token-pepper-0000',
        GUEST_WIFI_NETWORK: 'RELEASE-SYNTHETIC-NETWORK',
        GUEST_WIFI_PASSWORD: 'release-only-password',
        ALLOWED_ORIGINS: 'https://release.example.invalid',
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_PUBLIC_SITE_URL: 'https://release.example.invalid',
        BUILD_SITE_URL: 'https://release.example.invalid',
      });
      const missing: Record<string, string | undefined> = { ...valid };
      delete missing.ADMIN_JWT_SECRET;
      const invalid = {
        ...valid,
        ADMIN_DASH_SECRET: 'replace-me-with-a-production-dashboard-credential',
      };
      const identical = {
        ...valid,
        GUEST_JWT_SECRET: valid.ADMIN_JWT_SECRET,
      };

      const runCase = (env: Record<string, string | undefined>) =>
        spawnSync(process.execPath, [path.resolve('scripts/start-standalone.mjs'), serverFixture], {
          env: env as NodeJS.ProcessEnv,
          encoding: 'utf8',
          shell: false,
        });

      const cases: Array<[string, ReturnType<typeof runCase>, number]> = [
        ['missing', runCase(missing), 78],
        ['invalid', runCase(invalid), 78],
        ['identical', runCase(identical), 78],
        ['valid', runCase(valid), 0],
      ];

      for (const [label, result, expectedStatus] of cases) {
        expect(result.error, `${label} startup subprocess must execute`).toBeUndefined();
        expect(result.signal, `${label} startup subprocess must not be signalled`).toBeNull();
        expect(result.status, `${label} startup result`).toBe(expectedStatus);
        const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
        for (const value of [
          valid.ADMIN_JWT_SECRET,
          valid.GUEST_JWT_SECRET,
          valid.ADMIN_DASH_SECRET,
          invalid.ADMIN_DASH_SECRET,
        ]) {
          expect(output.includes(value!), `${label} output must not expose credentials`).toBe(false);
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

  it('redacts email, phone and token shapes without corrupting ordinary dates', () => {
    const token = `${'a'.repeat(24)}.${'b'.repeat(24)}.signature`;
    expect(redactSensitiveText(`guest@example.com +30 690 000 0000 ${token}`)).toBe(
      '[REDACTED_EMAIL] [REDACTED_PHONE] [REDACTED_TOKEN]',
    );
    expect(redactSensitiveText('Deployment 2026-07-15')).toBe('Deployment 2026-07-15');
    expect(redactSensitiveText('x'.repeat(100), 20)).toHaveLength(20);
  });

  it('keeps WebKit and Gecko stack frames, whose function name is followed by @ and a URL', () => {
    expect(redactSensitiveText('fn@https://host/a.js:1:2')).toBe('fn@https://host/a.js:1:2');

    const stack = [
      'handleClick@https://guest.example/_next/static/chunks/app/page-abc123.js:1:2345',
      'Foo.bar@https://guest.example/_next/static/chunks/app/page-abc123.js:2:3',
      '@https://guest.example/_next/static/chunks/main.js:1:10',
      'global code@https://guest.example/_next/static/chunks/main.js:3:1',
    ].join('\n');
    expect(redactSensitiveText(stack)).toBe(stack);
  });

  it('keeps V8 stack frames', () => {
    const stack = [
      'TypeError: x is undefined',
      '    at handleClick (https://guest.example/_next/static/chunks/app/page-abc123.js:1:2345)',
    ].join('\n');
    expect(redactSensitiveText(stack)).toBe(stack);
  });

  it('still redacts an address that carries a scheme or sits next to a URL', () => {
    expect(redactSensitiveText('guest@example.com')).toBe('[REDACTED_EMAIL]');
    expect(redactSensitiveText('mailto:guest@example.com')).toBe('[REDACTED_EMAIL]');
    expect(redactSensitiveText('https://guest@example.com/x')).toBe('[REDACTED_EMAIL]');
    expect(redactSensitiveText('cc:guest@example.com,https://host.example/x')).toBe('[REDACTED_EMAIL]');
  });

  it('redacts an address with non-ASCII letters that sits next to a URL', () => {
    expect(redactSensitiveText('μαρία@example.com,https://x.example/z')).toBe('[REDACTED_EMAIL]');
    expect(redactSensitiveText('user@παράδειγμα.gr;https://x.example/z')).toBe('[REDACTED_EMAIL]');
  });

  it('keeps a WebKit frame whose function name has non-ASCII letters', () => {
    const frame = 'Σφάλμα@https://guest.example/a.js:1:2';
    expect(redactSensitiveText(frame)).toBe(frame);
  });

  it.each([
    ['a decomposed accent directly before the @', 'Ζωή@example.com,https://x.example/z'.normalize('NFD')],
    ['a decomposed accent in the domain label', 'user@παράδειγμα.gr;https://x.example/z'.normalize('NFD')],
    ['Devanagari vowel signs, which are combining marks also in NFC', 'user@उदाहरण.भारत;https://x.example/z'],
  ])('redacts an address with combining marks that sits next to a URL: %s', (_label, input) => {
    expect(redactSensitiveText(input)).toBe('[REDACTED_EMAIL]');
  });

  it.each([
    ['an ASCII digit', 'user@παράδειγμα1.gr;https://x.example/z'],
    ['a non-ASCII digit (U+0663)', `user@παράδειγμα${String.fromCodePoint(0x0663)}.gr;https://x.example/z`],
  ])('redacts an address whose non-ASCII domain label holds %s next to a URL', (_label, input) => {
    expect(redactSensitiveText(input)).toBe('[REDACTED_EMAIL]');
  });

  it('keeps a WebKit frame whose function name has decomposed letters', () => {
    const frame = 'Σφάλμα@https://guest.example/a.js:1:2'.normalize('NFD');
    expect(redactSensitiveText(frame)).toBe(frame);
  });

  const embeddedJwt = `eyJ${'a'.repeat(24)}.eyJ${'b'.repeat(24)}.${'c'.repeat(24)}`;

  it.each([
    ['a cookie-style assignment', `guest_session=${embeddedJwt}; path=/`, '[REDACTED_TOKEN] path=/'],
    ['quotes', `"${embeddedJwt}"`, '[REDACTED_TOKEN]'],
    ['compact JSON holding two e-mail addresses', '{"to":"a@x.com","cc":"b@y.gr"}', '[REDACTED_EMAIL]'],
  ])('redacts a secret or an address embedded in %s', (_label, input, expected) => {
    expect(redactSensitiveText(input)).toBe(expected);
  });

  it('redacts a booking claim token wherever it appears in free text and keeps ordinary words with the prefix', () => {
    const claimToken = `claim_${'A1b2C3d4E5'.repeat(4)}xyz`;

    expect(redactSensitiveText(`invalid grant ${claimToken}`)).toBe('invalid grant [REDACTED_TOKEN]');
    expect(redactSensitiveText(`token=${claimToken}`)).toBe('[REDACTED_TOKEN]');
    expect(redactSensitiveText('claim_status updated')).toBe('claim_status updated');
  });

  it.each([
    ['authorization', true],
    ['user-agent', true],
    ['guest_password_hash', true],
    ['status', false],
    ['cfConnectingIp', true],
    ['x-forwarded-for', true],
    ['xRealIp', true],
    ['xOriginVerifiedClientIp', true],
    ['xOriginProxyAttestation', true],
  ])('classifies sensitive field %s', (field, expected) => {
    expect(isSensitiveFieldName(field)).toBe(expected);
  });
});

describe('HMAC keys and crypto secret bootstrap policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses missing claim-token or security peppers outside production without fallback', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SECURITY_PEPPER', 's'.repeat(32));
    vi.stubEnv('CLAIM_TOKEN_PEPPER', '');
    expect(() => requirePepper('CLAIM_TOKEN_PEPPER')).toThrow('CLAIM_TOKEN_PEPPER is required');

    vi.stubEnv('SECURITY_PEPPER', '');
    expect(() => privacyHmac('203.0.113.7', 'security-event-ip:v1')).toThrow('SECURITY_PEPPER is required');
  });

  it('keys context-separated privacy hashes with SECURITY_PEPPER', () => {
    vi.stubEnv('SECURITY_PEPPER', 'a'.repeat(32));
    const first = privacyHmac('203.0.113.7', 'ctx');
    expect(first).toBe(privacyHmac('203.0.113.7', 'ctx'));
    expect(first).not.toBe(privacyHmac('203.0.113.7', 'other-ctx'));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    vi.stubEnv('SECURITY_PEPPER', 'b'.repeat(32));
    expect(privacyHmac('203.0.113.7', 'ctx')).not.toBe(first);
  });

  it('generates one process-local pepper in development when none is configured', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SECURITY_PEPPER', '');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cryptoModule = await import('@/lib/crypto');
    const signed = cryptoModule.hashSensitive('value');
    expect(cryptoModule.verifySensitive('value', signed.salt, signed.hash)).toBe(true);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('fails module initialization in production without SECURITY_PEPPER but allows build phase', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', '');
    vi.stubEnv('SECURITY_PEPPER', '');
    await expect(import('@/lib/crypto')).rejects.toThrow('SECURITY_PEPPER');

    vi.resetModules();
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cryptoModule = await import('@/lib/crypto');
    expect(cryptoModule.hashSensitive('build-value').hash).toMatch(/^[a-f0-9]{64}$/);
    expect(warning).not.toHaveBeenCalled();
  });
});
