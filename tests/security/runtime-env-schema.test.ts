import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { runtimeEnvSchema } from '@/lib/runtime-env-schema.js';
import { SYNTHETIC_PRODUCTION_ENVIRONMENT } from '../../scripts/lib/release-gates.mjs';

const requiredEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/guest_guide',
  SECURITY_PEPPER: 'p'.repeat(16),
  CLAIM_TOKEN_PEPPER: 'c'.repeat(32),
  GUEST_WIFI_NETWORK: 'Guest WiFi',
  GUEST_WIFI_PASSWORD: 'wifi-password',
};

function syntheticCredential(purpose: string) {
  return createHash('sha256')
    .update(`runtime-env-schema-isolated-fixture:${purpose}`, 'utf8')
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
    ORIGIN_PROXY_SHARED_SECRET: createHash('sha256')
      .update('runtime-env-schema-isolated-fixture:origin-proxy', 'utf8')
      .digest('hex'),
    ...overrides,
  };
}

/** The [field, message] pairs of every issue, in report order. */
function issuesOf(env: Record<string, string | undefined>) {
  const result = runtimeEnvSchema.safeParse(env);
  return result.success ? [] : result.error.issues.map(({ path, message }) => [path[0], message]);
}

const WIFI_NAMES = ['GUEST_WIFI_NETWORK', 'GUEST_WIFI_PASSWORD'] as const;
const SITE_URL_NAMES = ['NEXT_PUBLIC_SITE_URL', 'BUILD_SITE_URL'] as const;

describe('production guest Wi-Fi values', () => {
  it.each(WIFI_NAMES)('rejects the .env.example value of %s without echoing it', (name) => {
    const example = readFileSync('.env.example', 'utf8')
      .split('\n')
      .find((line) => line.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? '';
    expect(example).not.toBe('');
    expect(issuesOf(productionEnv({ [name]: example }))).toEqual([[name, `${name} must not be a placeholder value`]]);
  });

  it.each([
    ['the word replace', 'replace-with-guest-wifi'],
    ['the word replace in capitals', 'REPLACE-me-wifi'],
    ['the word changeme', 'ChangeMe-wifi-1'],
    ['the word placeholder', 'wifi-placeholder'],
    ['the word example', 'My.Example.Wifi'],
    ['a placeholder word inside a longer word', 'xxreplacexx-wifi'],
    ['a bare placeholder word that is exactly eight characters long', 'changeme'],
  ])('rejects a value with %s without echoing it', (_label, value) => {
    for (const name of WIFI_NAMES) {
      const issues = issuesOf(productionEnv({ [name]: value }));
      expect(issues, name).toEqual([[name, `${name} must not be a placeholder value`]]);
      expect(JSON.stringify(issues), name).not.toContain(value);
    }
  });

  it('keeps the length rule next to the placeholder rule', () => {
    expect(issuesOf(productionEnv({ GUEST_WIFI_PASSWORD: 'replace' })).map(([path]) => path)).toEqual([
      'GUEST_WIFI_PASSWORD',
      'GUEST_WIFI_PASSWORD',
    ]);
    expect(issuesOf(productionEnv({ GUEST_WIFI_NETWORK: '' })).map(([path]) => path)).toEqual(['GUEST_WIFI_NETWORK']);
  });

  it.each([
    ['the values of the release synthetic production environment', 'RELEASE-SYNTHETIC-NETWORK', 'release-only-password'],
    ['the values of the production image smoke', 'smoke-guest-network', 'a3f09c1d5b7e2468fedcba98'],
    ['spaces and capitals', 'Guest WiFi', 'wifi-password'],
    ['Greek letters', 'Σπίτι Καλαμάτα', 'καλημέρα-2026'],
    ['a short network name and a patterned password', 'Villa5G', '12121212'],
  ])('accepts %s', (_label, network, password) => {
    const result = runtimeEnvSchema.safeParse(productionEnv({
      GUEST_WIFI_NETWORK: network,
      GUEST_WIFI_PASSWORD: password,
    }));
    expect(result.success).toBe(true);
  });

  it('accepts the Wi-Fi values that the release gates hand to the production build', () => {
    expect(issuesOf(productionEnv({
      GUEST_WIFI_NETWORK: SYNTHETIC_PRODUCTION_ENVIRONMENT.GUEST_WIFI_NETWORK,
      GUEST_WIFI_PASSWORD: SYNTHETIC_PRODUCTION_ENVIRONMENT.GUEST_WIFI_PASSWORD,
    }))).toEqual([]);
  });

  it('leaves the placeholders valid outside production, where ensure-pepper and .env.example use them', () => {
    const result = runtimeEnvSchema.safeParse({
      ...requiredEnv,
      GUEST_WIFI_NETWORK: 'replace-with-guest-network-name',
      GUEST_WIFI_PASSWORD: 'replace-with-guest-network-password',
    });
    expect(result.success).toBe(true);
  });
});

describe('site URL shape', () => {
  const bareOriginMessage = (name: string) => `${name} must be a bare origin (scheme://host[:port] with a lowercase host, punycode xn-- for non-ASCII names and no :443, without path, query, fragment, credentials or whitespace)`;
  const httpsMessage = (name: string) => `${name} must use HTTPS in production`;

  // The image compiles the same value into BUILD_SITE_URL, so the production rows set both fields.
  const withBuildUrl = (value: string) => productionEnv({ NEXT_PUBLIC_SITE_URL: value, BUILD_SITE_URL: value });

  it.each([
    'https://guide.example',
    'https://guide.example/',
    'https://www.guide.example',
    'https://guide.example:8443',
    'https://guide.example:8443/',
    'https://xn--bcher-kva.example',
    'https://localhost:3002',
    SYNTHETIC_PRODUCTION_ENVIRONMENT.NEXT_PUBLIC_SITE_URL,
  ])('accepts the production origin %s', (value) => {
    expect(issuesOf(productionEnv({ NEXT_PUBLIC_SITE_URL: value }))).toEqual([]);
    expect(issuesOf(withBuildUrl(value))).toEqual([]);
  });

  it.each([
    ['a path', 'https://guide.example/en'],
    ['a path with a trailing slash', 'https://guide.example/en/'],
    ['a path after a double slash', 'https://guide.example//en'],
    ['a double trailing slash', 'https://guide.example//'],
    ['a backslash path', 'https://guide.example\\en'],
    ['a query', 'https://guide.example?lang=en'],
    ['a query after the slash', 'https://guide.example/?lang=en'],
    ['an empty query', 'https://guide.example?'],
    ['a fragment', 'https://guide.example#top'],
    ['a fragment after the slash', 'https://guide.example/#top'],
    ['an empty fragment', 'https://guide.example#'],
    ['a username', 'https://owner@guide.example'],
    ['userinfo with a password', 'https://owner:pw-fixture@guide.example'],
    ['empty userinfo', 'https://@guide.example'],
    ['an explicit default port', 'https://guide.example:443'],
    ['an upper-case host', 'https://Guide.Example'],
    ['an upper-case scheme', 'HTTPS://guide.example'],
    ['a host in Unicode instead of punycode', 'https://bücher.example'],
    ['leading whitespace', ' https://guide.example'],
    ['trailing whitespace', 'https://guide.example '],
    ['a trailing newline', 'https://guide.example\n'],
  ])('rejects a production site URL with %s without echoing it', (_label, value) => {
    const single = issuesOf(productionEnv({ NEXT_PUBLIC_SITE_URL: value }));
    expect(single).toEqual([['NEXT_PUBLIC_SITE_URL', bareOriginMessage('NEXT_PUBLIC_SITE_URL')]]);
    const both = issuesOf(withBuildUrl(value));
    expect(both).toEqual([
      ['NEXT_PUBLIC_SITE_URL', bareOriginMessage('NEXT_PUBLIC_SITE_URL')],
      ['BUILD_SITE_URL', bareOriginMessage('BUILD_SITE_URL')],
    ]);
    for (const issues of [single, both]) {
      expect(JSON.stringify(issues)).not.toContain(value.trim());
    }
  });

  it('reports the HTTPS and the shape problem of one value as two issues', () => {
    expect(issuesOf(productionEnv({ NEXT_PUBLIC_SITE_URL: 'http://guide.example/en' }))).toEqual([
      ['NEXT_PUBLIC_SITE_URL', httpsMessage('NEXT_PUBLIC_SITE_URL')],
      ['NEXT_PUBLIC_SITE_URL', bareOriginMessage('NEXT_PUBLIC_SITE_URL')],
    ]);
    expect(issuesOf(withBuildUrl('http://guide.example'))).toEqual([
      ['NEXT_PUBLIC_SITE_URL', httpsMessage('NEXT_PUBLIC_SITE_URL')],
      ['BUILD_SITE_URL', httpsMessage('BUILD_SITE_URL')],
    ]);
  });

  it('names BUILD_SITE_URL when only the compiled URL is malformed', () => {
    const issues = issuesOf(productionEnv({ BUILD_SITE_URL: 'https://guest.example/en' }));
    expect(issues).toContainEqual(['BUILD_SITE_URL', bareOriginMessage('BUILD_SITE_URL')]);
    expect(issues).toContainEqual([
      'NEXT_PUBLIC_SITE_URL',
      'Runtime site URL does not match the URL compiled into this image',
    ]);
  });

  it.each(SITE_URL_NAMES)('reports an unparsable %s once, without echoing it', (name) => {
    const value = 'guide.example/?token=fixture';
    const env = name === 'NEXT_PUBLIC_SITE_URL'
      ? productionEnv({ NEXT_PUBLIC_SITE_URL: value })
      : productionEnv({ BUILD_SITE_URL: value });
    const issues = issuesOf(env);
    expect(issues.filter(([path]) => path === name)).toEqual([[name, `${name} must be a valid URL`]]);
    expect(JSON.stringify(issues)).not.toContain('token=fixture');
  });

  it.each(SITE_URL_NAMES)('treats an empty %s as not configured', (name) => {
    const result = runtimeEnvSchema.safeParse(productionEnv({ [name]: '' }));
    expect(result.success).toBe(name === 'BUILD_SITE_URL');
  });

  it('does not apply the shape rule outside production, where .env.example keeps http://localhost:3000', () => {
    for (const value of ['http://localhost:3000', 'http://localhost:3000/en?x=1#top', 'https://owner@localhost:3000//']) {
      const result = runtimeEnvSchema.safeParse({ ...requiredEnv, NEXT_PUBLIC_SITE_URL: value });
      expect(result.success, value).toBe(true);
      if (result.success) expect(result.data.NEXT_PUBLIC_SITE_URL).toBe(value);
    }
    expect(issuesOf({ ...requiredEnv, NEXT_PUBLIC_SITE_URL: 'not a url' })).toEqual([
      ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_SITE_URL must be a valid URL'],
    ]);
  });
});
