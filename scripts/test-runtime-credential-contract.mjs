#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function deriveNonProductionCredential(purpose) {
  return createHash('sha256')
    .update(`macro-c-r1-isolated-release-fixture:${purpose}`, 'utf8')
    .digest('base64url');
}

const SYNTHETIC_PRODUCTION_ENVIRONMENT = Object.freeze({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://release:synthetic@127.0.0.1:1/release_build',
  DIRECT_URL: 'postgresql://release:synthetic@127.0.0.1:1/release_build',
  ADMIN_JWT_SECRET: deriveNonProductionCredential('admin-jwt'),
  ADMIN_DASH_SECRET: deriveNonProductionCredential('admin-dashboard'),
  GUEST_JWT_SECRET: deriveNonProductionCredential('guest-jwt'),
  SECURITY_PEPPER: 'release-only-security-pepper',
  CLAIM_TOKEN_PEPPER: 'release-only-claim-token-pepper-0000',
  GUEST_WIFI_NETWORK: 'RELEASE-SYNTHETIC-NETWORK',
  GUEST_WIFI_PASSWORD: 'release-only-password',
  ALLOWED_ORIGINS: 'https://release.example.invalid',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SITE_URL: 'https://release.example.invalid',
  BUILD_SITE_URL: 'https://release.example.invalid',
  ORIGIN_PROXY_SHARED_SECRET:
    '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2',
});

const root = mkdtempSync(path.join(os.tmpdir(), 'runtime-credential-contract-'));
const serverFixture = path.join(root, 'server-fixture.mjs');
writeFileSync(serverFixture, 'export const started = true;\n', { mode: 0o600 });

function runCase(environment) {
  return spawnSync(
    process.execPath,
    ['scripts/start-standalone.mjs', serverFixture],
    {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: environment,
      encoding: 'utf8',
      shell: false,
    },
  );
}

try {
  const valid = { ...SYNTHETIC_PRODUCTION_ENVIRONMENT };
  const missing = { ...valid };
  delete missing.ADMIN_JWT_SECRET;
  const invalid = {
    ...valid,
    ADMIN_DASH_SECRET: 'replace-me-with-a-production-dashboard-credential',
  };
  const identical = {
    ...valid,
    GUEST_JWT_SECRET: valid.ADMIN_JWT_SECRET,
  };

  const results = [
    ['missing', runCase(missing), 78],
    ['invalid', runCase(invalid), 78],
    ['identical', runCase(identical), 78],
    ['valid', runCase(valid), 0],
  ];

  for (const [label, result, expectedStatus] of results) {
    assert.equal(result.error, undefined, `${label} startup subprocess must execute`);
    assert.equal(result.signal, null, `${label} startup subprocess must not be signalled`);
    assert.equal(result.status, expectedStatus, `${label} startup result`);
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    for (const value of [
      valid.ADMIN_JWT_SECRET,
      valid.GUEST_JWT_SECRET,
      valid.ADMIN_DASH_SECRET,
      invalid.ADMIN_DASH_SECRET,
    ]) {
      assert.equal(output.includes(value), false, `${label} output must not expose credentials`);
    }
  }

  console.log('Standalone runtime credential contract passed: 4/4 isolated cases.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
