import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  HOSTILE_INTEGRATION_ENVIRONMENT,
  RELEASE_GATES,
  SYNTHETIC_PRODUCTION_ENVIRONMENT,
} from '../lib/release-gates.mjs';
import {
  releasePolicyInternals,
  validateReleasePolicy,
} from '../lib/release-policy.mjs';
import { runReleaseVerification } from '../verify-release.mjs';

const APPROVED_IMAGE =
  'postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
const NODE_IMAGE_DIGEST = `sha256:${'0123456789abcdef'.repeat(4)}`;
const OTHER_NODE_IMAGE_DIGEST = `sha256:${'fedcba9876543210'.repeat(4)}`;
const NODE_IMAGE = `node:22-alpine@${NODE_IMAGE_DIGEST}`;
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
// The services of docker/docker-compose.prod.yml that must pin NODE_ENV (T-F25, R-698).
const PRODUCTION_PINNED_SERVICES = ['web', 'outbox', 'operations'];

function pinnedProductionServiceLines(names = PRODUCTION_PINNED_SERVICES) {
  return names.flatMap((name) => [
    `  ${name}:`,
    '    environment:',
    '      NODE_ENV: production',
  ]);
}

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
  await writeRelative(
    root,
    'scripts/system-orchestrator.sh',
    '#!/usr/bin/env bash\nset -Eeuo pipefail\n',
  );
  await writeRelative(root, 'scripts/ensure-pepper.js', 'const SECURITY_PEPPER = true;\n');
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
  await writeRelative(root, '.dockerignore', [
    '.env',
    '.env.*',
    '**/.env',
    '**/.env.*',
    '**/*.pem',
    '!.env.example',
    '',
  ].join('\n'));
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
      schemaVersion: 2,
      findings: releasePolicyInternals.expectedCurrentSecretFixtures.map(
        ([valueSha256, classification, filePath, rule]) => ({
          classification,
          path: filePath,
          rule,
          valueSha256,
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
    'const artifactScanOptions = { rejectEnvironmentFiles: true };',
    'function formatFinding() {}',
    'void args; void git; void command; void files; void artifacts;',
    'void ENV_FILE_PATTERN; void GITLEAKS_BIN; void binarySha256; void formatFinding;',
    'void artifactScanOptions;',
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
  await writeRelative(
    root,
    'docker/docker-compose.prod.yml',
    `${compose}${pinnedProductionServiceLines().join('\n')}\n`,
  );
  await writeRelative(root, 'docker/Dockerfile.security', [
    `FROM ${NODE_IMAGE} AS builder`,
    'WORKDIR /app',
    `FROM ${NODE_IMAGE} AS runner`,
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
      "  'sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';",
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
    digest: 'sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94',
    mediaType: 'application/vnd.oci.image.index.v1+json',
  }));
  await writeRelative(root, 'deploy/nginx/nginx.conf.template', [
    'server_tokens off;',
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
    "log_format origin_safe '$request_id $request_method $uri $status $request_time '",
    "                       'limit_req=$limit_req_status limit_conn=$limit_conn_status';",
    'access_log /var/log/nginx/access.log origin_safe;',
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

test('rejects a system orchestrator that can target production', async () => {
  await withFixture(async (root) => {
    await writeFile(
      path.join(root, 'scripts/system-orchestrator.sh'),
      '#!/usr/bin/env bash\nPROFILE="development"\ncase "$PROFILE" in\n  production) exit 0 ;;\nesac\n',
      'utf8',
    );
    assertRejected(await validateReleasePolicy(root), /system orchestrator must be development-only/u);
  });
});

async function mutateDockerfile(root, mutate) {
  const dockerfilePath = path.join(root, 'docker/Dockerfile.security');
  await writeFile(dockerfilePath, mutate(await readFile(dockerfilePath, 'utf8')), 'utf8');
}

test('accepts runner-stage changes outside the static runner checks', async () => {
  await withFixture(async (root) => {
    await mutateDockerfile(root, (dockerfile) => dockerfile
      .replace(RUNTIME_ENV, `${RUNTIME_ENV}\nENV EXTRA_SETTING=1`)
      .replace(RUNTIME_HARDENING_RUN, `${RUNTIME_HARDENING_RUN}\nRUN true`)
      .replace(
        `FROM ${NODE_IMAGE} AS runner`,
        `FROM ${NODE_IMAGE} AS workers\nUSER 1001:1001\nFROM ${NODE_IMAGE} AS runner`,
      )
      .concat(`FROM ${NODE_IMAGE} AS migrate\nADD . .\nUSER root\n`));
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

test('requires a runner stage in the security image', async () => {
  await withFixture(async (root) => {
    await mutateDockerfile(root, (dockerfile) => dockerfile.replace(
      `FROM ${NODE_IMAGE} AS runner`,
      `FROM ${NODE_IMAGE} AS web`,
    ));
    assertRejected(
      await validateReleasePolicy(root),
      /docker\/Dockerfile\.security must contain a runner stage/u,
    );
  });
});

test('requires the runner stage to run as the non-root runtime user', async () => {
  for (const mutate of [
    (dockerfile) => dockerfile.replace(RUNTIME_USER, 'USER root'),
    (dockerfile) => dockerfile.replace(`${RUNTIME_USER}\n`, ''),
    (dockerfile) => dockerfile.replace(RUNTIME_USER, `${RUNTIME_USER}\nUSER root`),
  ]) {
    await withFixture(async (root) => {
      await mutateDockerfile(root, mutate);
      assertRejected(
        await validateReleasePolicy(root),
        /docker\/Dockerfile\.security: runner stage must run as USER 1001:1001/u,
      );
    });
  }
});

test('requires the runner stage to remove npm and npx', async () => {
  for (const replacement of [
    'RUN apk add --no-cache dumb-init=1.2.5-r4',
    RUNTIME_SETUP_RUN.replace(' /usr/local/bin/npx', ''),
    RUNTIME_SETUP_RUN.replace('rm -f', 'ls'),
  ]) {
    await withFixture(async (root) => {
      await mutateDockerfile(root, (dockerfile) => dockerfile.replace(RUNTIME_SETUP_RUN, replacement));
      assertRejected(
        await validateReleasePolicy(root),
        /docker\/Dockerfile\.security: runner stage must remove npm and npx/u,
      );
    });
  }
  await withFixture(async (root) => {
    await mutateDockerfile(root, (dockerfile) => dockerfile
      .replace(RUNTIME_SETUP_RUN, 'RUN apk add --no-cache dumb-init=1.2.5-r4')
      .replace(
        `FROM ${NODE_IMAGE} AS runner`,
        `FROM ${NODE_IMAGE} AS workers\n${RUNTIME_SETUP_RUN}\nFROM ${NODE_IMAGE} AS runner`,
      ));
    assertRejected(
      await validateReleasePolicy(root),
      /docker\/Dockerfile\.security: runner stage must remove npm and npx/u,
    );
  });
});

const CONTINUED_SETUP_RUN = [
  'RUN apk add --no-cache dumb-init=1.2.5-r4 \\',
  '  # comment lines inside a continued RUN are removed by Docker',
  '  && rm -rf /usr/local/lib/node_modules/npm \\',
  '     /usr/local/lib/node_modules/corepack /opt/yarn-* \\',
  '  # a second comment between the removal commands',
  '  && rm -f /usr/local/bin/npm /usr/local/bin/npx \\',
  '     /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \\',
  '  && addgroup --system --gid 1001 nodejs \\',
  '  && adduser --system --uid 1001 --ingroup nodejs nextjs',
].join('\n');

test('joins backslash continuations and ignores comment lines inside them', async () => {
  await withFixture(async (root) => {
    await mutateDockerfile(root, (dockerfile) => dockerfile.replace(RUNTIME_SETUP_RUN, CONTINUED_SETUP_RUN));
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
  await withFixture(async (root) => {
    await mutateDockerfile(root, (dockerfile) => dockerfile.replace(
      RUNTIME_SETUP_RUN,
      CONTINUED_SETUP_RUN.replace('rm -f', 'ls'),
    ));
    assertRejected(
      await validateReleasePolicy(root),
      /docker\/Dockerfile\.security: runner stage must remove npm and npx/u,
    );
  });
});

test('requires every external FROM of the security image to be a digest-pinned Node alpine image', async () => {
  for (const mutate of [
    (dockerfile) => dockerfile.replace(`FROM ${NODE_IMAGE} AS runner`, 'FROM node:22-alpine AS runner'),
    (dockerfile) => dockerfile.replace(`FROM ${NODE_IMAGE} AS builder`, 'FROM node:22-alpine AS builder'),
    (dockerfile) => dockerfile.replace(
      `FROM ${NODE_IMAGE} AS builder`,
      `FROM node:22-alpine@sha256:${'0123456789abcdef'.repeat(4).slice(1)} AS builder`,
    ),
    (dockerfile) => dockerfile.replace(
      `FROM ${NODE_IMAGE} AS builder`,
      `FROM alpine:3.22@${NODE_IMAGE_DIGEST} AS builder`,
    ),
    (dockerfile) => dockerfile.concat('FROM node:22-alpine AS workers\n'),
  ]) {
    await withFixture(async (root) => {
      await mutateDockerfile(root, mutate);
      assertRejected(
        await validateReleasePolicy(root),
        /docker\/Dockerfile\.security: external FROM instructions must be node:<major>-alpine@sha256:<64 hex>/u,
      );
    });
  }
});

test('requires one Node image digest across all stages of the security image', async () => {
  for (const mutate of [
    (dockerfile) => dockerfile.replace(
      `FROM ${NODE_IMAGE} AS builder`,
      `FROM node:22-alpine@${OTHER_NODE_IMAGE_DIGEST} AS builder`,
    ),
    (dockerfile) => dockerfile.concat(`FROM node:22-alpine@${OTHER_NODE_IMAGE_DIGEST} AS workers\n`),
  ]) {
    await withFixture(async (root) => {
      await mutateDockerfile(root, mutate);
      assertRejected(
        await validateReleasePolicy(root),
        /docker\/Dockerfile\.security: all external FROM instructions must use the same Node image digest/u,
      );
    });
  }
});

test('skips FROM instructions that name an earlier stage and accepts a stage without a name', async () => {
  await withFixture(async (root) => {
    await mutateDockerfile(root, (dockerfile) => dockerfile
      .concat(`FROM builder AS bundle\nFROM bundle\nFROM ${NODE_IMAGE}\n`));
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

test('rejects runner-stage ADD instructions', async () => {
  for (const instruction of [
    'ADD . .',
    'ADD src ./src',
  ]) {
    await withFixture(async (root) => {
      await mutateDockerfile(root, (dockerfile) => dockerfile.replace(
        RUNTIME_CREDENTIAL_COPY,
        `${RUNTIME_CREDENTIAL_COPY}\n${instruction}`,
      ));
      assertRejected(
        await validateReleasePolicy(root),
        /docker\/Dockerfile\.security: runner stage ADD instructions are forbidden/u,
      );
    });
  }
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
      'const secret = process.env.GUEST_JWT_SECRET;\n',
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /guest JWT signing must use the centralized runtime credential reader/u,
    );
  });
});

test('rejects a fixed development guest signing credential next to the credential reader', async () => {
  await withFixture(async (root) => {
    await writeFile(
      path.join(root, 'src/lib/guestSession.ts'),
      "readRuntimeCredential('GUEST_JWT_SECRET');\nconst fallback = 'dev-guest-secret-change-me';\n",
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /fixed development guest signing credentials are forbidden/u,
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
      valueSha256: '0'.repeat(64),
    });
    await writeFile(allowlistPath, `${JSON.stringify(allowlist, null, 2)}\n`, 'utf8');
    assertRejected(await validateReleasePolicy(root), /reviewed fixture values/u);
  });
});

test('rejects a tampered secret-scanner tool lock', async () => {
  const lockName = 'config/secret-scanning/tool.lock.json';
  for (const tamper of [
    (lock) => { lock.checksumsFileSha256 = '0'.repeat(64); },
    (lock) => { lock.artifacts['darwin-arm64'].binarySha256 = '0'.repeat(64); },
    (lock) => { lock.version = '8.30.2'; },
  ]) {
    await withFixture(async (root) => {
      const lockPath = path.join(root, lockName);
      const lock = JSON.parse(await readFile(lockPath, 'utf8'));
      tamper(lock);
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
      assertRejected(
        await validateReleasePolicy(root),
        /secret scanner tool lock must match the reviewed Gitleaks 8\.30\.1 artifact/u,
      );
    });
  }
  await withFixture(async (root) => {
    await writeRelative(root, lockName, '{"schemaVersion": 1,');
    assertRejected(await validateReleasePolicy(root), /secret scanner tool lock must contain valid JSON/u);
  });
});

test('rejects a global Gitleaks ignore file', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, '.gitleaksignore', 'unreviewed-global-suppression\n');
    assertRejected(await validateReleasePolicy(root), /global .gitleaksignore suppression/u);
  });
});

// Each of these hides a finding from Gitleaks 8.30.1 (probed with a scratch scan), so a
// finding could be accepted without the hashed fixture allowlist. The check is textual
// and case-insensitive: Gitleaks reads these keys without regard to case, in tables, in
// inline tables and under quoted names.
for (const [label, mutate] of [
  [
    'a global allowlists table',
    (config) => `${config}[[allowlists]]\ndescription = "scratch"\npaths = ['''.*''']\n`,
  ],
  [
    'a legacy global allowlist table',
    (config) => `${config}[allowlist]\npaths = ['''.*''']\n`,
  ],
  [
    'a rule-level allowlists table',
    (config) => `${config}[[rules.allowlists]]\nregexes = ['''.*''']\n`,
  ],
  [
    'an inline allowlists key',
    (config) => `${config}allowlists = [{ paths = ['''.*'''] }]\n`,
  ],
  [
    'a quoted upper-case allowlists table',
    (config) => `${config}[["ALLOWLISTS"]]\npaths = ['''.*''']\n`,
  ],
  [
    'disabled default rules',
    (config) => config.replace(
      'useDefault = true',
      () => 'useDefault = true\ndisabledRules = ["generic-api-key"]',
    ),
  ],
]) {
  test(`rejects ${label} in the scanner configuration`, async () => {
    await withFixture(async (root) => {
      const configPath = path.join(root, 'config/secret-scanning/gitleaks.toml');
      const config = await readFile(configPath, 'utf8');
      const mutated = mutate(config);
      assert.notEqual(mutated, config, 'the scanner configuration mutation did not change the fixture');
      await writeFile(configPath, mutated, 'utf8');
      assertRejected(
        await validateReleasePolicy(root),
        /secret scanner configuration must not add allowlists or disable rules/u,
      );
    });
  });
}

// The root-level lines match only the top of the Docker context. The any-depth lines
// keep a docker/.env or a nested *.pem out of the builder stage ('COPY . .'), and each
// one is pinned on its own so that a longer line cannot stand in for a shorter one.
for (const line of ['**/.env', '**/.env.*', '**/*.pem']) {
  test(`rejects a .dockerignore without the any-depth ${line} line`, async () => {
    await withFixture(async (root) => {
      const ignorePath = path.join(root, '.dockerignore');
      const lines = (await readFile(ignorePath, 'utf8')).split('\n');
      assert.ok(lines.includes(line), `the fixture .dockerignore lacks ${line}`);
      await writeFile(ignorePath, lines.filter((entry) => entry !== line).join('\n'), 'utf8');
      assertRejected(
        await validateReleasePolicy(root),
        /Docker inputs must exclude .env files and PEM keys at any depth/u,
      );
    });
  });
}

test('rejects a .dockerignore that drops the !.env.example exception', async () => {
  await withFixture(async (root) => {
    const ignorePath = path.join(root, '.dockerignore');
    const lines = (await readFile(ignorePath, 'utf8')).split('\n');
    assert.ok(lines.includes('!.env.example'), 'the fixture .dockerignore lacks !.env.example');
    await writeFile(ignorePath, lines.filter((entry) => entry !== '!.env.example').join('\n'), 'utf8');
    assertRejected(await validateReleasePolicy(root), /while retaining \.env\.example/u);
  });
});

test('rejects an artifact scan that no longer rejects environment files', async () => {
  await withFixture(async (root) => {
    const scannerPath = path.join(root, 'scripts/check-secrets.mjs');
    const scanner = await readFile(scannerPath, 'utf8');
    await writeFile(
      scannerPath,
      scanner.replace('rejectEnvironmentFiles: true', 'rejectEnvironmentFiles: false'),
      'utf8',
    );
    assertRejected(
      await validateReleasePolicy(root),
      /restricted marker: rejectEnvironmentFiles: true/u,
    );
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

test('rejects a retired deployment dependency and an alias of one', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.devDependencies.wrangler = '3.0.0';
    });
    assertRejected(
      await validateReleasePolicy(root),
      /retired deployment dependency wrangler is forbidden/u,
    );
  });
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.dependencies['deploy-helper'] = 'npm:wrangler@3.0.0';
    });
    assertRejected(
      await validateReleasePolicy(root),
      /retired deployment dependency alias deploy-helper -> wrangler is forbidden/u,
    );
  });
});

// The push and publication forms of the toolchain in use. Each is checked as a package
// script and as an active script file, and the full message is compared, so the label
// that fires is the one named here.
for (const [label, command, rule] of [
  [
    'a Docker build with the --push flag',
    'docker buildx build --push -t registry.example/app:1 .',
    'Docker/Buildx push flag',
  ],
  [
    'docker compose push',
    'docker compose -f docker/docker-compose.prod.yml push',
    'Docker Compose push',
  ],
  [
    'hyphenated docker-compose push',
    'docker-compose -f docker/docker-compose.prod.yml push',
    'Docker Compose push',
  ],
  [
    'git push behind a global option',
    'git -C . push origin main',
    'Git push',
  ],
  [
    'a plain git push',
    'git push origin main',
    'Git push',
  ],
]) {
  test(`rejects ${label} in a package script and in an active script file`, async () => {
    await withFixture(async (root) => {
      await mutatePackage(root, (packageJson) => {
        packageJson.scripts.shipImage = command;
      });
      const errors = await validateReleasePolicy(root);
      assert.ok(
        errors.includes(`${rule} is forbidden in package script shipImage`),
        `expected the ${rule} rejection, got: ${errors.join(' | ')}`,
      );
    });
    await withFixture(async (root) => {
      await writeRelative(root, 'scripts/ship-it.sh', `#!/usr/bin/env bash\n${command}\n`);
      const errors = await validateReleasePolicy(root);
      assert.ok(
        errors.includes(`scripts/ship-it.sh: ${rule} is forbidden in active scripts`),
        `expected the ${rule} rejection, got: ${errors.join(' | ')}`,
      );
    });
  });
}

test('rejects a deploy command inside an active script file', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'scripts/publish-preview.sh', '#!/usr/bin/env bash\nvercel deploy --prod\n');
    assertRejected(
      await validateReleasePolicy(root),
      /scripts\/publish-preview\.sh: Vercel deployment command is forbidden in active scripts/u,
    );
  });
});

test('does not mistake a compose file name or a later command for a push', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'scripts/ship-it.sh', [
      '#!/usr/bin/env bash',
      '# docker-compose.prod.yml defines the images that the owner may push by hand',
      'git -C . status | grep push',
      '',
    ].join('\n'));
    assert.deepEqual(await validateReleasePolicy(root), []);
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

test('rejects a production Nginx configuration that does not hide its version', async () => {
  await withFixture(async (root) => {
    const configPath = path.join(root, 'deploy/nginx/nginx.conf.template');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, config.replace('server_tokens off;\n', ''));
    assertRejected(await validateReleasePolicy(root), /server_tokens off;/u);
  });
});

async function mutateNginxConfig(root, mutate) {
  const configPath = path.join(root, 'deploy/nginx/nginx.conf.template');
  const config = await readFile(configPath, 'utf8');
  const mutated = mutate(config);
  assert.notEqual(mutated, config, 'the Nginx mutation did not change the fixture');
  await writeFile(configPath, mutated, 'utf8');
}

// A commented-out or disabled directive must not satisfy a marker. The replacements
// are functions so that a `$` in the new text is never read as a replacement pattern.
for (const [label, original, replacement, pattern] of [
  [
    'a commented-out server_tokens directive',
    'server_tokens off;',
    '# server_tokens off;',
    /production Nginx configuration lacks: server_tokens off;/u,
  ],
  [
    'a commented-out ssl_verify_client directive',
    'ssl_verify_client on;',
    '# ssl_verify_client on;',
    /production Nginx configuration lacks: ssl_verify_client on;/u,
  ],
  [
    'a disabled ssl_verify_client directive that repeats the old text in a comment',
    'ssl_verify_client on;',
    'ssl_verify_client off; # ssl_verify_client on;',
    /production Nginx configuration lacks: ssl_verify_client on;/u,
  ],
  [
    'a disabled ssl_verify_client directive with a comment glued to the semicolon',
    'ssl_verify_client on;',
    'ssl_verify_client off;# ssl_verify_client on;',
    /production Nginx configuration lacks: ssl_verify_client on;/u,
  ],
]) {
  test(`rejects ${label}`, async () => {
    await withFixture(async (root) => {
      await mutateNginxConfig(root, (config) => config.replace(original, () => replacement));
      assertRejected(await validateReleasePolicy(root), pattern);
    });
  });
}

test('ignores forbidden trusted-ingress patterns that only appear in Nginx comments', async () => {
  await withFixture(async (root) => {
    const comments = [
      '# set_real_ip_from 0.0.0.0/0;',
      '# proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '# proxy_set_header X-Origin-Proxy-Attestation $http_x_origin_proxy_attestation;',
      '',
    ].join('\n');
    await mutateNginxConfig(root, (config) => config + comments);
    await writeRelative(
      root,
      'deploy/nginx/includes/cloudflare-realip.conf',
      '# set_real_ip_from 0.0.0.0/0;\nset_real_ip_from 203.0.113.0/24;\n',
    );
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

for (const variable of [
  '$request',
  '$request_uri',
  '$args',
  '$query_string',
  '$is_args',
  '$remote_addr',
  '$binary_remote_addr',
  '$http_x_forwarded_for',
  '$http_referer',
]) {
  test(`rejects ${variable} in the Nginx access log format`, async () => {
    await withFixture(async (root) => {
      await mutateNginxConfig(root, (config) => config.replace(
        '$request_id ',
        () => `${variable} $request_id `,
      ));
      const errors = await validateReleasePolicy(root);
      assert.ok(
        errors.includes(`Nginx log_format origin_safe must not contain ${variable}`),
        `expected the ${variable} rejection, got: ${errors.join(' | ')}`,
      );
    });
  });
}

test('allows $request_id, $request_method and $request_time in the Nginx access log format', async () => {
  await withFixture(async (root) => {
    const config = await readFile(path.join(root, 'deploy/nginx/nginx.conf.template'), 'utf8');
    for (const variable of ['$request_id', '$request_method', '$request_time']) {
      assert.ok(config.includes(variable), `the fixture log format must carry ${variable}`);
    }
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

test('does not mistake a longer variable name for a forbidden one in the Nginx access log format', async () => {
  await withFixture(async (root) => {
    await mutateNginxConfig(root, (config) => config.replace(
      '$request_id ',
      () => '$http_x_forwarded_for_proto $request_id ',
    ));
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

test('reads the whole Nginx access log format when a quoted field contains a semicolon', async () => {
  await withFixture(async (root) => {
    await mutateNginxConfig(root, (config) => config.replace(
      '$request_id $request_method',
      () => '$request_id;$remote_addr $request_method',
    ));
    const errors = await validateReleasePolicy(root);
    assert.ok(
      errors.includes('Nginx log_format origin_safe must not contain $remote_addr'),
      `expected the $remote_addr rejection, got: ${errors.join(' | ')}`,
    );
  });
});

for (const [label, mutate] of [
  [
    'a log format whose name only starts with origin_safe',
    (config) => config.replace('log_format origin_safe ', 'log_format origin_safe_v2 '),
  ],
  [
    'a commented-out log_format origin_safe statement',
    (config) => config.replace(
      /log_format origin_safe [^;]*;/u,
      (statement) => statement.replace(/^/gmu, '# '),
    ),
  ],
  [
    'an access_log line that uses another format',
    (config) => config.replace(
      'access_log /var/log/nginx/access.log origin_safe;',
      'access_log /var/log/nginx/access.log combined;',
    ),
  ],
  [
    'an access_log line whose format name only starts with origin_safe',
    (config) => config.replace(
      'access_log /var/log/nginx/access.log origin_safe;',
      'access_log /var/log/nginx/access.log origin_safe_v2;',
    ),
  ],
  [
    'a commented-out access_log line',
    (config) => config.replace(
      'access_log /var/log/nginx/access.log origin_safe;',
      '# access_log /var/log/nginx/access.log origin_safe;',
    ),
  ],
]) {
  test(`rejects ${label}`, async () => {
    await withFixture(async (root) => {
      await mutateNginxConfig(root, mutate);
      assertRejected(
        await validateReleasePolicy(root),
        /Nginx must define log_format origin_safe and write the access log with it/u,
      );
    });
  });
}

test('ignores forbidden log variables that only appear in Nginx comments', async () => {
  await withFixture(async (root) => {
    await mutateNginxConfig(root, (config) => config.replace(
      'log_format origin_safe',
      () => '# Never log $request_uri, $request, $args or $remote_addr.\nlog_format origin_safe',
    ));
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

test('rejects $request_uri outside the Nginx access log format', async () => {
  await withFixture(async (root) => {
    await mutateNginxConfig(root, (config) => `${config}proxy_set_header X-Debug-Uri $request_uri;\n`);
    assertRejected(
      await validateReleasePolicy(root),
      /Nginx logging must exclude query strings from the claim transport/u,
    );
  });
});

test('rejects the unmaintained Nginx 1.28.3 image', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'deploy/nginx/image.lock.json', JSON.stringify({
      repository: 'docker.io/library/nginx',
      digest: 'sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236',
      mediaType: 'application/vnd.oci.image.index.v1+json',
    }));
    assertRejected(await validateReleasePolicy(root), /approved multi-platform digest-pinned official image/u);
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
    assertRejected(await validateReleasePolicy(root), /port "3000:3000" must not be publicly published/u);
  });
});

async function writeProductionCompose(root, serviceLines) {
  await writeRelative(root, 'docker/docker-compose.prod.yml', [
    'services:',
    '  db:',
    `    image: ${APPROVED_IMAGE}`,
    ...serviceLines,
    '',
  ].join('\n'));
}

for (const [label, serviceLines, pattern] of [
  ['an interpolated host port without a host IP', ['  web:', '    ports:', '      - "${WEB_PORT:-3000}:3000"']],
  ['an all-interfaces host IP', ['  web:', '    ports:', '      - "0.0.0.0:${WEB_PORT:-3000}:3000"']],
  ['a different host port', ['  web:', '    ports:', '      - "8080:3000"']],
  ['a bare container port', ['  web:', '    ports:', '      - "3000"']],
  ['a long-syntax entry', ['  web:', '    ports:', '      - target: 3000', '        published: "8080"']],
  ['a flow-sequence value', ['  web:', '    ports: ["8080:3000"]']],
  ['a compact block sequence', ['  web:', '    ports:', '    - "8080:3000"']],
  ['a database port', ['    ports:', '      - "5432:5432"']],
  ['a flow-sequence value on the next line', [
    '    ports:', '      - "127.0.0.1:${POSTGRES_PORT:-5432}:5432"',
    '  web:', '    ports:', '      ["0.0.0.0:3000:3000"]',
  ]],
  ['an alias value on the next line', [
    '  web:', '    x-p: &p', '      - "0.0.0.0:3000:3000"', '    ports:', '      *p',
  ]],
  ['a public entry between loopback entries', [
    '  web:', '    ports:', '      - "127.0.0.1:${WEB_PORT:-3000}:3000"', '      - "0.0.0.0:8443:3000"',
    '      - "[::1]:${WEB_PORT:-3000}:3000"',
  ], /port "0\.0\.0\.0:8443:3000" must not be publicly published/u],
  ['a flow-mapping service', ['  evil: { image: busybox, ports: ["0.0.0.0:8080:80"] }']],
  ['a flow-mapping service with a quoted key', [
    '  evil: { "image": "busybox", "ports": ["0.0.0.0:8080:80"] }',
  ]],
  ['a flow-mapping service with a single-quoted key', [
    "  evil: { image: busybox, 'ports': ['0.0.0.0:8080:80'] }",
  ]],
  ['a flow mapping that starts with the ports key', [
    '  evil: {ports: ["0.0.0.0:8080:80"], image: busybox}',
  ]],
  ['a ports key after a comma on a continuation line', [
    '  evil: {', '    image: busybox, ports: ["0.0.0.0:8080:80"]', '  }',
  ]],
  ['a loopback list inside a flow mapping (fails closed)', [
    '  evil: { image: busybox, ports: ["127.0.0.1:8080:80"] }',
  ]],
]) {
  test(`rejects a public production port publication: ${label}`, async () => {
    await withFixture(async (root) => {
      await writeProductionCompose(root, serviceLines);
      assertRejected(
        await validateReleasePolicy(root),
        pattern ?? /docker-compose\.prod\.yml: port .+ must not be publicly published/u,
      );
    });
  });
}

test('accepts loopback-only production port publications', async () => {
  await withFixture(async (root) => {
    await writeProductionCompose(root, [
      '    ports:',
      '      - "127.0.0.1:${POSTGRES_PORT:-5432}:5432"',
      '    volumes:',
      '      - postgres-prod-data:/var/lib/postgresql/data',
      '  web:',
      '    ports:',
      '      - "127.0.0.1:${WEB_PORT:-3000}:3000"',
      '      - "[::1]:${WEB_PORT:-3000}:3000"',
      '    tmpfs:',
      '      - /tmp',
      '    environment:',
      '      NODE_ENV: production',
      ...pinnedProductionServiceLines(['outbox', 'operations']),
    ]);
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

test('accepts the real production compose file', async () => {
  const real = await readFile(
    new URL('../../docker/docker-compose.prod.yml', import.meta.url),
    'utf8',
  );
  await withFixture(async (root) => {
    await writeRelative(root, 'docker/docker-compose.prod.yml', real);
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

for (const [label, serviceLines] of [
  ['a block mapping on the web service', ['  web:', '    network_mode: host']],
  ['a quoted key and value', ['  web:', '    "network_mode": "host"']],
  ['a single-quoted value', ['  web:', "    network_mode: 'host'"]],
  ['a flow mapping', ['  web: { image: busybox, network_mode: host }']],
  ['the database service', ['    network_mode: host']],
]) {
  test(`rejects host networking in the production compose file: ${label}`, async () => {
    await withFixture(async (root) => {
      await writeProductionCompose(root, [
        ...serviceLines,
        ...pinnedProductionServiceLines(),
      ]);
      assertRejected(
        await validateReleasePolicy(root),
        /docker-compose\.prod\.yml: network_mode: host is forbidden/u,
      );
    });
  });
}

test('accepts a commented host network note and a non-host network mode', async () => {
  await withFixture(async (root) => {
    await writeProductionCompose(root, [
      '  # network_mode: host is forbidden here',
      '  web:',
      '    network_mode: bridge',
      '    environment:',
      '      NODE_ENV: production',
      ...pinnedProductionServiceLines(['outbox', 'operations']),
    ]);
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

for (const service of PRODUCTION_PINNED_SERVICES) {
  test(`rejects a production compose file whose ${service} service has no NODE_ENV pin`, async () => {
    await withFixture(async (root) => {
      await writeProductionCompose(root, [
        ...pinnedProductionServiceLines(
          PRODUCTION_PINNED_SERVICES.filter((name) => name !== service),
        ),
        `  ${service}:`,
        '    env_file: app.env',
      ]);
      assert.deepEqual(await validateReleasePolicy(root), [
        `docker/docker-compose.prod.yml: service "${service}" must set environment NODE_ENV: production`,
      ]);
    });
  });
}

for (const [label, lines] of [
  ['a development value', ['  web:', '    environment:', '      NODE_ENV: development']],
  ['a production-like value', ['  web:', '    environment:', '      NODE_ENV: production-test']],
  ['a commented pin', [
    '  web:', '    environment:', '      LOG_LEVEL: info', '      # NODE_ENV: production',
  ]],
  ['the pin outside environment', ['  web:', '    labels:', '      NODE_ENV: production']],
  ['the pin nested below another environment entry', [
    '  web:', '    environment:', '      OTHER:', '        NODE_ENV: production',
  ]],
  ['the pin only on the database service', [
    '    environment:', '      NODE_ENV: production',
    '  web:', '    environment:', '      LOG_LEVEL: info',
  ]],
  ['a flow-mapping service (fails closed)', [
    '  web: { environment: { NODE_ENV: production } }',
  ]],
]) {
  test(`rejects a production compose file whose web service has no NODE_ENV pin: ${label}`, async () => {
    await withFixture(async (root) => {
      await writeProductionCompose(root, [
        ...lines,
        ...pinnedProductionServiceLines(['outbox', 'operations']),
      ]);
      assert.deepEqual(await validateReleasePolicy(root), [
        'docker/docker-compose.prod.yml: service "web" must set environment NODE_ENV: production',
      ]);
    });
  });
}

test('rejects a production compose file that defines none of the pinned services', async () => {
  await withFixture(async (root) => {
    await writeProductionCompose(root, []);
    assert.deepEqual(await validateReleasePolicy(root), PRODUCTION_PINNED_SERVICES
      .map((service) => (
        `docker/docker-compose.prod.yml: service "${service}" must set environment NODE_ENV: production`
      ))
      .sort());
  });
});

test('accepts quoted and commented NODE_ENV pins among other environment entries', async () => {
  await withFixture(async (root) => {
    await writeProductionCompose(root, [
      '  web:',
      '    environment:',
      '      LOG_LEVEL: info',
      '      NODE_ENV: "production"',
      '      OTHER: value',
      '    restart: unless-stopped',
      '  outbox:',
      '    environment:   # runtime mode',
      "      NODE_ENV: 'production'",
      '  operations:',
      '    environment:',
      '      NODE_ENV: production # pinned',
    ]);
    assert.deepEqual(await validateReleasePolicy(root), []);
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

// A commented-out or disabled rate-limit directive must not satisfy a marker. The
// replacements are functions so that a `$` in the new text is never read as a pattern.
for (const [label, original, replacement, marker] of [
  [
    'a commented-out limit_req_status directive',
    'limit_req_status 429;',
    '# limit_req_status 429;',
    'limit_req_status 429;',
  ],
  [
    'a disabled limit_req_dry_run directive that repeats the old text in a comment',
    'limit_req_dry_run on;',
    'limit_req_dry_run off; # limit_req_dry_run on;',
    'limit_req_dry_run on;',
  ],
  [
    'a commented-out rate-limit zone',
    'limit_req_zone $auth_rate_key zone=auth_operations:10m rate=5r/s;',
    '# limit_req_zone $auth_rate_key zone=auth_operations:10m rate=5r/s;',
    'zone=auth_operations:',
  ],
]) {
  test(`rejects ${label}`, async () => {
    await withFixture(async (root) => {
      await mutateNginxConfig(root, (config) => config.replace(original, () => replacement));
      const errors = await validateReleasePolicy(root);
      assert.ok(
        errors.includes(`layered Nginx rate limiting lacks: ${marker}`),
        `expected the ${marker} rejection, got: ${errors.join(' | ')}`,
      );
    });
  });
}

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
      /Vercel deployment command is forbidden inside verify:release/u,
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
      /persistent migration commands are forbidden inside verify:release/u,
    );
  });
});

test('rejects a verify-release spawn that sets shell: true', async () => {
  await withFixture(async (root) => {
    const verifyPath = path.join(root, 'scripts/verify-release.mjs');
    const source = await readFile(verifyPath, 'utf8');
    const mutated = source.replace('{ shell: false }', '{ shell: true }');
    assert.notEqual(mutated, source, 'the verify-release mutation did not change the fixture');
    await writeFile(verifyPath, mutated, 'utf8');
    assertRejected(
      await validateReleasePolicy(root),
      /verify:release must retain restricted marker: shell: false/u,
    );
  });
});

test('rejects a 31st gate appended to the release profile', async () => {
  await withFixture(async (root) => {
    const gates = [...RELEASE_GATES, fixtureGate('unreviewed-extra')];
    assertRejected(
      await validateReleasePolicy(root, { gates }),
      /release gate profile must contain exactly 30 gates/u,
    );
  });
});

test('reports a malformed gate entry instead of throwing', async () => {
  await withFixture(async (root) => {
    for (const malformed of [null, { id: RELEASE_GATES[0].id, command: 'node' }]) {
      const gates = RELEASE_GATES.map((gate) => ({ ...gate, args: [...gate.args] }));
      gates[0] = malformed;
      assertRejected(
        await validateReleasePolicy(root, { gates }),
        /release gate 1 must be the restricted secret-sources profile/u,
      );
    }
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

// The names of .env.example assignments, read the way the orchestrator's key mask reads them.
const ENV_EXAMPLE_NAME = /^[ \t]*(?:export )?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/gmu;

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
    // Every hostile DB/PG value of the integration profile also reaches the base gates,
    // except the image, which only the integration gate receives (R-673).
    for (const [name, value] of Object.entries(HOSTILE_INTEGRATION_ENVIRONMENT)) {
      if (name !== 'INTEGRATION_POSTGRES_IMAGE') assert.equal(calls[0].environment[name], value, name);
    }
    assert.equal(calls[0].environment.PGHOST, 'hostile.invalid');
    assert.equal(calls[0].environment.NODE_ENV, 'test');
    assert.equal(calls[0].environment.TZ, 'UTC');
    assert.equal(calls[0].environment.NEXT_TELEMETRY_DISABLED, '1');
    assert.equal(calls[0].environment.NPM_CONFIG_UPDATE_NOTIFIER, 'false');
    assert.equal(calls[0].environment.PAGER, 'cat');
    assert.equal(calls[0].environment.GIT_PAGER, 'cat');
    assert.equal(calls[0].environment.GIT_TERMINAL_PROMPT, '0');
    // The key mask blanks each name of .env.example that no fixed value sets. The names are
    // read from that file, so the test does not depend on one particular name being present.
    const envExample = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
    const fixedNames = new Set([
      ...Object.keys(HOSTILE_INTEGRATION_ENVIRONMENT),
      ...Object.keys(SYNTHETIC_PRODUCTION_ENVIRONMENT),
      'NODE_ENV',
      'TZ',
      'NEXT_TELEMETRY_DISABLED',
      'NPM_CONFIG_UPDATE_NOTIFIER',
      'PAGER',
      'GIT_PAGER',
      'GIT_TERMINAL_PROMPT',
    ]);
    const maskedNames = [...envExample.matchAll(ENV_EXAMPLE_NAME)]
      .map((match) => match[1])
      // Inside verify:release this very test runs with every .env.example name already blank, so a blank name counts as unset.
      .filter((name) => !fixedNames.has(name) && (process.env[name] ?? '') === '');
    assert.ok(maskedNames.length > 0, '.env.example must name keys that the key mask blanks');
    for (const name of maskedNames) {
      assert.equal(calls[0].environment[name], '', name);
      assert.equal(calls[2].environment[name], '', name);
    }
    assert.equal(calls[1].environment.INTEGRATION_POSTGRES_IMAGE, APPROVED_IMAGE);
    assert.equal(calls[2].environment.NODE_ENV, 'production');
    assert.equal(calls[2].environment.NEXT_PUBLIC_SITE_URL, 'https://release.example.invalid');
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

test('release orchestrator verifies orphan state when a gate after a passed integration fails', async () => {
  const calls = [];
  const result = await runReleaseVerification({
    gates: [fixtureGate('integration', 'integration'), fixtureGate('later')],
    runner: async (command, args) => {
      calls.push([command, ...args].join(' '));
      if (args.at(-1) === 'later') throw new Error('synthetic later failure');
    },
    stdout: memoryWriter(),
    stderr: memoryWriter(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.failedGate, 'later');
  assert.deepEqual(calls, [
    'node --version integration',
    'node --version later',
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
