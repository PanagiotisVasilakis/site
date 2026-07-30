import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  APPROVED_POSTGRES_IMAGE,
  HOSTILE_INTEGRATION_ENVIRONMENT,
  RELEASE_GATES,
  SYNTHETIC_PRODUCTION_ENVIRONMENT,
} from './release-gates.mjs';

const EXPECTED_POSTGRES_IMAGE =
  'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
const EXPECTED_NGINX_IMAGE =
  'docker.io/library/nginx@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236';

const EXPECTED_HOSTILE_INTEGRATION_ENVIRONMENT = Object.freeze({
  INTEGRATION_POSTGRES_IMAGE: EXPECTED_POSTGRES_IMAGE,
  DATABASE_URL: 'postgresql://hostile:hostile@hostile.invalid:1/hostile',
  DIRECT_URL: 'postgresql://hostile:hostile@hostile.invalid:1/hostile',
  SHADOW_DATABASE_URL: 'postgresql://hostile:hostile@hostile.invalid:1/hostile',
  PGHOST: 'hostile.invalid',
  PGPORT: '1',
  PGDATABASE: 'hostile',
  PGUSER: 'hostile',
  PGPASSWORD: 'hostile',
  POSTGRES_DB: 'hostile',
  POSTGRES_USER: 'hostile',
  POSTGRES_PASSWORD: 'hostile',
});

function deriveExpectedNonProductionCredential(purpose) {
  return createHash('sha256')
    .update(`macro-c-r1-isolated-release-fixture:${purpose}`, 'utf8')
    .digest('base64url');
}

const EXPECTED_SYNTHETIC_PRODUCTION_ENVIRONMENT = Object.freeze({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://release:synthetic@127.0.0.1:1/release_build',
  DIRECT_URL: 'postgresql://release:synthetic@127.0.0.1:1/release_build',
  ADMIN_JWT_SECRET: deriveExpectedNonProductionCredential('admin-jwt'),
  ADMIN_DASH_SECRET: deriveExpectedNonProductionCredential('admin-dashboard'),
  GUEST_JWT_SECRET: deriveExpectedNonProductionCredential('guest-jwt'),
  SECURITY_PEPPER: 'release-only-security-pepper',
  CLAIM_TOKEN_PEPPER: 'release-only-claim-token-pepper-0000',
  GUEST_WIFI_NETWORK: 'RELEASE-SYNTHETIC-NETWORK',
  GUEST_WIFI_PASSWORD: 'release-only-password',
  PROPERTY_TIME_ZONE: 'Europe/Athens',
  ALLOWED_ORIGINS: 'https://release.example.invalid',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SITE_URL: 'https://release.example.invalid',
  BUILD_SITE_URL: 'https://release.example.invalid',
  ORIGIN_PROXY_SHARED_SECRET:
    '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2',
});

import { createRequire, isBuiltin } from 'node:module';
import ts from 'typescript';

const RUNTIME_MODULE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs']);
const RUNTIME_LOADER_MODULE_SPECIFIERS = new Set([
  'module',
  'node:module',
  'node:process',
  'process',
]);
const RUNTIME_DATA_MODULE_SPECIFIERS = new Set([
  'fs',
  'fs/promises',
  'node:fs',
  'node:fs/promises',
]);
const EXPECTED_RUNTIME_SETUP_RUN = [
  'RUN apk add --no-cache dumb-init=1.2.5-r4',
  '&& rm -rf /usr/local/lib/node_modules/npm',
  '/usr/local/lib/node_modules/corepack /opt/yarn-*',
  '&& rm -f /usr/local/bin/npm /usr/local/bin/npx',
  '/usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg',
  '&& addgroup --system --gid 1001 nodejs',
  '&& adduser --system --uid 1001 --ingroup nodejs nextjs',
].join(' ');
const EXPECTED_POST_COPY_RUNTIME_HARDENING_RUN = [
  'RUN mkdir -p /app/.next/cache/images',
  '&& find /app -type d -exec chmod 0555 {} +',
  '&& find /app -type f -exec chmod 0444 {} +',
  '&& chmod 0555 /app/server.js',
  '&& chown nextjs:nodejs /app/.next/cache/images',
  '&& chmod 0750 /app/.next/cache/images',
].join(' ');
const EXPECTED_RUNTIME_USER = 'USER 1001:1001';
const EXPECTED_RUNTIME_ENTRYPOINT = 'ENTRYPOINT ["/usr/bin/dumb-init", "--"]';
const EXPECTED_RUNTIME_COMMAND =
  'CMD ["node", "scripts/start-standalone.mjs", "server.js"]';
const EXPECTED_RUNTIME_HEALTHCHECK = [
  'HEALTHCHECK --interval=30s --timeout=4s',
  '--start-period=15s --retries=3',
  'CMD wget --quiet --spider',
  'http://127.0.0.1:3000/api/health/ready || exit 1',
].join(' ');
const EXPECTED_RUNTIME_ENV = [
  'ENV NODE_ENV=production',
  'NEXT_TELEMETRY_DISABLED=1',
  'NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}',
  'BUILD_SITE_URL=${NEXT_PUBLIC_SITE_URL}',
  'HOSTNAME=0.0.0.0',
  'PORT=3000',
].join(' ');

const EXPECTED_GATE_PROFILE = Object.freeze([
  ['secret-sources', 'npm', ['--ignore-scripts', 'run', 'check:secrets:sources'], 'base'],
  ['secret-tests', 'npm', ['--ignore-scripts', 'run', 'test:secret-scanning'], 'base'],
  ['release-policy', 'npm', ['--ignore-scripts', 'run', 'validate:release-policy'], 'base'],
  ['release-policy-tests', 'npm', ['--ignore-scripts', 'run', 'test:release-policy'], 'base'],
  ['runtime-credentials', 'npm', ['--ignore-scripts', 'run', 'test:runtime-credentials'], 'base'],
  ['cloudflare-ingress', 'npm', ['--ignore-scripts', 'run', 'check:cloudflare-ips'], 'base'],
  ['nginx-ingress', 'npm', ['--ignore-scripts', 'run', 'test:nginx-ingress'], 'base'],
  ['conflicts', 'npm', ['--ignore-scripts', 'run', 'check:conflicts'], 'base'],
  ['prisma-manifest', 'npm', ['--ignore-scripts', 'run', 'check:prisma-integrity'], 'base'],
  ['prisma-tests', 'npm', ['--ignore-scripts', 'run', 'test:prisma-integrity'], 'base'],
  ['postgres-policy-tests', 'npm', ['--ignore-scripts', 'run', 'test:postgres-image-policy'], 'base'],
  ['default-tests', 'npm', ['--ignore-scripts', 'run', 'test'], 'base'],
  ['unit-tests', 'npm', ['--ignore-scripts', 'run', 'test:unit'], 'base'],
  ['security-tests', 'npm', ['--ignore-scripts', 'run', 'test:security'], 'base'],
  ['coverage', 'npm', ['--ignore-scripts', 'run', 'test:coverage'], 'base'],
  ['typecheck', 'npm', ['--ignore-scripts', 'run', 'typecheck'], 'base'],
  ['lint', 'npm', ['--ignore-scripts', 'run', 'lint', '--', '--max-warnings=0'], 'base'],
  ['security-lint', 'npm', ['--ignore-scripts', 'run', 'lint:security'], 'base'],
  ['dead-code', 'npm', ['--ignore-scripts', 'run', 'check:dead-code'], 'base'],
  ['licenses', 'npm', ['--ignore-scripts', 'run', 'security:license-check'], 'base'],
  ['prisma-validate', 'npm', ['--ignore-scripts', 'run', 'prisma:validate'], 'base'],
  ['postgres-policy', 'npm', ['--ignore-scripts', 'run', 'check:postgres-image-policy'], 'base'],
  ['integration', 'npm', ['--ignore-scripts', 'run', 'test:integration'], 'integration'],
  ['production-build', 'npm', ['--ignore-scripts', 'run', 'validate:security'], 'production'],
  ['secret-artifacts', 'npm', ['--ignore-scripts', 'run', 'check:secrets:artifacts'], 'base'],
  ['final-prisma-manifest', 'npm', ['--ignore-scripts', 'run', 'check:prisma-integrity'], 'base'],
  ['final-prisma-hashes', 'npm', ['--ignore-scripts', 'run', 'hash:prisma-integrity'], 'base'],
  ['diff-check', 'git', ['diff', '--check'], 'base'],
  ['candidate-diff', 'npm', ['--ignore-scripts', 'run', 'check:candidate-diff'], 'base'],
  ['integration-orphans', 'npm', ['--ignore-scripts', 'run', 'check:integration-orphans'], 'base'],
]);

const EXPECTED_PACKAGE_SCRIPTS = Object.freeze({
  'verify:release': 'node scripts/verify-release.mjs',
  'validate:release-policy': 'node scripts/validate-release-policy.mjs',
  'test:release-policy': 'node --test scripts/tests/release-policy.test.mjs',
  'check:secrets:sources': 'node scripts/check-secrets.mjs sources',
  'check:secrets:artifacts': 'node scripts/check-secrets.mjs artifacts',
  'test:secret-scanning': 'node --test scripts/tests/secret-scanning.test.mjs',
  'test:runtime-credentials': 'node scripts/test-runtime-credential-contract.mjs',
  'check:cloudflare-ips': 'node scripts/check-cloudflare-ips.mjs',
  'check:cloudflare-ips:current': 'node scripts/check-cloudflare-ips.mjs --current',
  'test:nginx-ingress': 'bash scripts/test-nginx-ingress.sh',
  'check:conflicts': 'node scripts/check-conflict-markers.mjs',
  'check:candidate-diff': 'node scripts/check-candidate-diff.mjs',
  'check:prisma-integrity': 'node scripts/check-prisma-integrity.mjs',
  'test:prisma-integrity': 'node --test scripts/tests/prisma-integrity.test.mjs',
  'test:postgres-image-policy':
    'vitest run --config vitest.config.ts tests/unit/postgres-image-policy.test.ts --reporter=default',
  'check:postgres-image-policy': 'tsx scripts/check-postgres-image-policy.ts',
  test: 'vitest run --config vitest.config.ts --reporter=default',
  'test:unit': 'vitest run --config vitest.config.ts tests/unit --reporter=default',
  'test:security': 'vitest run --config vitest.config.ts tests/security --reporter=default',
  'test:coverage': 'vitest run --config vitest.config.ts --coverage --reporter=default',
  typecheck: 'tsc --noEmit',
  lint: 'eslint',
  'lint:security': 'eslint --config eslint.config.security.mjs . --max-warnings=0',
  'check:dead-code': 'knip --include files,dependencies,unlisted,binaries',
  'security:license-check': 'tsx scripts/check-licenses.ts',
  'prisma:validate': 'prisma validate',
  'test:integration': 'tsx tests/integration/run.ts',
  'validate:security': 'tsx scripts/validate-security.ts',
  build:
    'tsx scripts/generate-precache.ts && tsx scripts/validate-content.ts && tsx scripts/generate-version.ts && next build',
  'hash:prisma-integrity': 'node scripts/hash-prisma-integrity.mjs',
  'check:integration-orphans': 'node scripts/check-integration-orphans.mjs',
});

const EXPECTED_SECRET_TOOL_LOCK = Object.freeze({
  schemaVersion: 1,
  name: 'gitleaks',
  version: '8.30.1',
  releaseUrl: 'https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1',
  checksumsUrl:
    'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt',
  checksumsFileSha256: '061476c21adaf5441516f96f185c1a4706a83cd6329b9b38762271b3d4a52fae',
  artifacts: {
    'darwin-arm64': {
      archive: 'gitleaks_8.30.1_darwin_arm64.tar.gz',
      archiveSha256: 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
      binarySha256: 'ba52fb1bfabbcde42f032afad3d6e0b19dff8ed105229a16e7caa338bbc0e84f',
    },
  },
});

const EXPECTED_HISTORICAL_SECRET_BASELINE = Object.freeze([
  ['retired-admin-signing-credential', '70034c89f223bf572c23197f842077ab9c5b2764:docs/DEPLOYMENT_SUCCESS.md:generic-api-key:65'],
  ['retired-session-credential', '70034c89f223bf572c23197f842077ab9c5b2764:docs/DEPLOYMENT_SUCCESS.md:generic-api-key:66'],
  ['retired-admin-dashboard-credential', '70034c89f223bf572c23197f842077ab9c5b2764:docs/DEPLOYMENT_SUCCESS.md:generic-api-key:67'],
  ['retired-legacy-signing-credential', '70034c89f223bf572c23197f842077ab9c5b2764:docs/DEPLOYMENT_SUCCESS.md:generic-api-key:68'],
  ['retired-guest-signing-credential', '70034c89f223bf572c23197f842077ab9c5b2764:docs/DEPLOYMENT_SUCCESS.md:generic-api-key:69'],
  ['retired-unused-encryption-credential', '70034c89f223bf572c23197f842077ab9c5b2764:docs/DEPLOYMENT_SUCCESS.md:generic-api-key:71'],
]);

const EXPECTED_CURRENT_SECRET_FIXTURES = Object.freeze([
  ['synthetic-release-fixture', '.env.example', 'credential-bearing-database-url', 5, 15],
  ['synthetic-test-fixture', 'tests/integration/auth/portal-eligibility-consistency.test.ts', 'generic-api-key', 29, 8],
  ['synthetic-test-fixture', 'tests/security/client-identity-route-regression.test.ts', 'generic-api-key', 147, 18],
  ['synthetic-test-fixture', 'tests/security/client-identity.test.ts', 'generic-api-key', 12, 10],
  ['synthetic-test-fixture', 'tests/security/portal-auth-client-identity.test.ts', 'generic-api-key', 32, 18],
  ['synthetic-test-fixture', 'tests/security/security-boundaries.test.ts', 'generic-api-key', 33, 6],
  ['synthetic-test-fixture', 'tests/security/security-boundaries.test.ts', 'generic-api-key', 222, 10],
  ['synthetic-release-fixture', 'scripts/lib/release-gates.mjs', 'credential-bearing-database-url', 29, 19],
  ['synthetic-release-fixture', 'scripts/lib/release-gates.mjs', 'credential-bearing-database-url', 30, 17],
  ['synthetic-release-fixture', 'scripts/lib/release-policy.mjs', 'credential-bearing-database-url', 40, 19],
  ['synthetic-release-fixture', 'scripts/lib/release-policy.mjs', 'credential-bearing-database-url', 41, 17],
  ['synthetic-test-fixture', 'tests/unit/integration-database-safety.test.ts', 'credential-bearing-database-url', 228, 28],
]);

const FORBIDDEN_PLATFORM_PATHS = Object.freeze([
  'CNAME',
  'vercel.json',
  '.vercelignore',
  'wrangler.toml',
  'wrangler.json',
  'wrangler.jsonc',
  'open-next.config.js',
  'open-next.config.mjs',
  'open-next.config.ts',
  '_routes.json',
  'public/CNAME',
  '.open-next',
  '.vercel',
]);

const FORBIDDEN_DEPLOY_COMMANDS = Object.freeze([
  ['Vercel deployment command', /\bvercel\s+(?:deploy|--prod)\b/iu],
  [
    'version-qualified Vercel deployment command',
    /\bvercel@[A-Za-z0-9._~^*<>=/-]{1,80}\s+(?:deploy|--prod)\b/iu,
  ],
  ['Wrangler deployment command', /\bwrangler\s+deploy\b/iu],
  ['Wrangler Pages deployment command', /\bwrangler\s+pages\s+deploy\b/iu],
  [
    'version-qualified Wrangler deployment command',
    /\bwrangler@[A-Za-z0-9._~^*<>=/-]{1,80}\s+deploy\b/iu,
  ],
  [
    'version-qualified Wrangler Pages deployment command',
    /\bwrangler@[A-Za-z0-9._~^*<>=/-]{1,80}\s+pages\s+deploy\b/iu,
  ],
  ['Cloudflare Pages deployment command', /\bcloudflare\s+pages\s+deploy\b/iu],
  ['GitHub Pages deployment command', /\bgh-pages\b/iu],
  ['Git push', /\bgit\s+push\b/iu],
  ['Docker registry push', /\bdocker\s+push\b/iu],
  ['Docker registry push', /\bdocker\s+image\s+push\b/iu],
  ['package publication', /\bnpm\s+publish\b/iu],
]);

const POLICY_SELF_FILES = new Set([
  'scripts/lib/release-policy.mjs',
  'scripts/tests/release-policy.test.mjs',
]);

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function filesBelow(directory, root) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(absolute, root));
    else files.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return files;
}

function renderCommand(command, args) {
  return [command, ...args].join(' ');
}

function validateGateProfile(gates, errors) {
  if (!Array.isArray(gates) || gates.length !== EXPECTED_GATE_PROFILE.length) {
    errors.push(`release gate profile must contain exactly ${EXPECTED_GATE_PROFILE.length} gates`);
    return;
  }

  for (const [index, expected] of EXPECTED_GATE_PROFILE.entries()) {
    const gate = gates[index];
    const [id, command, args, environment] = expected;
    if (!gate || gate.id !== id || gate.command !== command
      || JSON.stringify(gate.args) !== JSON.stringify(args)
      || gate.environment !== environment) {
      errors.push(`release gate ${index + 1} must be the restricted ${id} profile`);
      continue;
    }

    const rendered = renderCommand(gate.command, gate.args);
    for (const [label, pattern] of FORBIDDEN_DEPLOY_COMMANDS) {
      if (pattern.test(rendered)) errors.push(`${label} is forbidden inside verify:release`);
    }
    if (/\b(?:prisma\s+migrate|migrate\s+deploy|system:migrate|db:migrate)\b/iu.test(rendered)) {
      errors.push('persistent migration commands are forbidden inside verify:release');
    }
  }
}

function validateControlledEnvironments(errors) {
  if (APPROVED_POSTGRES_IMAGE !== EXPECTED_POSTGRES_IMAGE) {
    errors.push('the release profile must use the exact approved digest-pinned PostgreSQL image');
  }
  if (JSON.stringify(HOSTILE_INTEGRATION_ENVIRONMENT)
    !== JSON.stringify(EXPECTED_HOSTILE_INTEGRATION_ENVIRONMENT)) {
    errors.push('the integration gate must use only the exact hostile DB/PG environment');
  }
  if (JSON.stringify(SYNTHETIC_PRODUCTION_ENVIRONMENT)
    !== JSON.stringify(EXPECTED_SYNTHETIC_PRODUCTION_ENVIRONMENT)) {
    errors.push('the production build must use the restricted unreachable synthetic environment');
  }
}

function validatePackage(packageJson, errors) {
  const scripts = packageJson?.scripts;
  if (!scripts || Array.isArray(scripts) || typeof scripts !== 'object') {
    errors.push('package.json scripts must be an object');
    return;
  }

  for (const [name, expected] of Object.entries(EXPECTED_PACKAGE_SCRIPTS)) {
    if (scripts[name] !== expected) errors.push(`package script ${name} must be exactly: ${expected}`);
  }
  for (const removed of ['check:ci-policy', 'test:ci-policy', 'prisma:migrate:deploy:all', 'migrate']) {
    if (Object.hasOwn(scripts, removed)) errors.push(`retired or unsafe package script ${removed} is forbidden`);
  }

  const protectedLifecycleScripts = new Set([
    'verify:release',
    'build',
    ...EXPECTED_GATE_PROFILE
      .filter(([, command]) => command === 'npm')
      .map(([, , args]) => args[2]),
  ]);
  for (const name of protectedLifecycleScripts) {
    for (const hook of [`pre${name}`, `post${name}`]) {
      if (Object.hasOwn(scripts, hook)) {
        errors.push(`npm lifecycle hook ${hook} is forbidden for the local release path`);
      }
    }
  }

  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== 'string') {
      errors.push(`package script ${name} must be a string`);
      continue;
    }
    for (const [label, pattern] of FORBIDDEN_DEPLOY_COMMANDS) {
      if (pattern.test(command)) errors.push(`${label} is forbidden in package script ${name}`);
    }
    if (/^(?:deploy|release(?::deploy)?)(?::|$)/iu.test(name)) {
      errors.push(`automatic deployment-oriented package script ${name} is forbidden`);
    }
    if (/\b(?:migrate|db\s+push)\b/iu.test(command)
      && /(?:--profile\s+production|NODE_ENV\s*=\s*production)/iu.test(command)) {
      errors.push(`database mutation package script ${name} must not select production by default`);
    }
    const hasStaging = /(?:STAGING_DATABASE_URL|DATABASE_URL_STAGING)/u.test(command);
    const hasProduction = /(?:PROD(?:UCTION)?_DATABASE_URL|DATABASE_URL_PROD(?:UCTION)?)/u.test(command);
    if (hasStaging && hasProduction) {
      errors.push(`package script ${name} must not consume staging and production credentials together`);
    }
  }

  const directDependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
    ...(packageJson.optionalDependencies ?? {}),
    ...(packageJson.peerDependencies ?? {}),
  };
  for (const dependency of [
    'vercel',
    'wrangler',
    'gh-pages',
    '@cloudflare/next-on-pages',
    '@opennextjs/cloudflare',
  ]) {
    if (Object.hasOwn(directDependencies, dependency)) {
      errors.push(`retired deployment dependency ${dependency} is forbidden`);
    }
  }
  for (const [name, version] of Object.entries(directDependencies)) {
    if (typeof version !== 'string') continue;
    for (const dependency of [
      'vercel',
      'wrangler',
      'gh-pages',
      '@cloudflare/next-on-pages',
      '@opennextjs/cloudflare',
    ]) {
      if (version.startsWith(`npm:${dependency}@`)) {
        errors.push(`retired deployment dependency alias ${name} -> ${dependency} is forbidden`);
      }
    }
  }
}

async function validateActiveScripts(root, errors) {
  const scriptFiles = [
    ...await filesBelow(path.join(root, 'scripts'), root),
    ...await filesBelow(path.join(root, 'deploy'), root),
    ...await filesBelow(path.join(root, 'docker'), root),
    'Makefile',
    'Dockerfile',
    'docker-compose.yml',
  ]
    .filter((relative) => relative !== 'scripts/README.md')
    .filter((relative) => !POLICY_SELF_FILES.has(relative));

  for (const relative of scriptFiles) {
    const source = await readOptional(path.join(root, relative));
    if (source === undefined) continue;
    for (const [label, pattern] of FORBIDDEN_DEPLOY_COMMANDS) {
      if (pattern.test(source)) errors.push(`${relative}: ${label} is forbidden in active scripts`);
    }
    const hasStaging = /(?:STAGING_DATABASE_URL|DATABASE_URL_STAGING)/u.test(source);
    const hasProduction = /(?:PROD(?:UCTION)?_DATABASE_URL|DATABASE_URL_PROD(?:UCTION)?)/u.test(source);
    if (hasStaging && hasProduction) {
      errors.push(`${relative}: staging and production database credentials must not be consumed together`);
    }
  }
}

async function validatePostgresReferences(root, errors) {
  for (const relative of ['docker-compose.yml', 'docker/docker-compose.prod.yml']) {
    const source = await readOptional(path.join(root, relative));
    if (source === undefined) {
      errors.push(`${relative} is required`);
      continue;
    }
    const references = source.match(/\bpostgres:[^\s"']+/gu) ?? [];
    if (references.length !== 1 || references[0] !== EXPECTED_POSTGRES_IMAGE) {
      errors.push(`${relative} must contain exactly the approved digest-pinned PostgreSQL image`);
    }
  }

  const policySource = await readOptional(
    path.join(root, 'tests/integration/support/postgres-image-policy.ts'),
  );
  if (policySource === undefined
    || !policySource.includes("APPROVED_POSTGRES_REPOSITORY = 'postgres'")
    || !policySource.includes("APPROVED_POSTGRES_TAG = '16-alpine'")
    || !policySource.includes(`'${EXPECTED_POSTGRES_IMAGE.slice('postgres:16-alpine@'.length)}'`)) {
    errors.push('integration PostgreSQL policy constants must retain the approved tag and full digest');
  }
}

async function validateTrustedIngress(root, errors) {
  const config = await readOptional(path.join(root, 'deploy/nginx/nginx.conf.template'));
  const manifestSource = await readOptional(path.join(root, 'deploy/nginx/cloudflare-ips.json'));
  const realIp = await readOptional(path.join(root, 'deploy/nginx/includes/cloudflare-realip.conf'));
  const geo = await readOptional(path.join(root, 'deploy/nginx/includes/cloudflare-geo.conf'));
  const imageSource = await readOptional(path.join(root, 'deploy/nginx/image.lock.json'));
  const runbook = await readOptional(path.join(root, 'docs/deployment/origin-ingress-runbook.md'));
  const systemd = await readOptional(path.join(root, 'deploy/systemd/qr-city-guide.service'));
  const orchestrator = await readOptional(path.join(root, 'scripts/system-orchestrator.sh'));
  const runtimeSchema = await readOptional(path.join(root, 'src/lib/runtime-env-schema.js'));
  const identitySource = await readOptional(path.join(root, 'src/lib/net/getClientIp.ts'));

  if (!config) {
    errors.push('versioned production Nginx trusted-ingress configuration is required');
  } else {
    const requiredMarkers = [
      'real_ip_header CF-Connecting-IP;',
      'cloudflare-realip.conf',
      'cloudflare-geo.conf',
      'X-Origin-Verified-Client-IP $verified_client_ip;',
      'X-Origin-Proxy-Attestation $origin_proxy_attestation;',
      'CF-Connecting-IP $verified_client_ip;',
      'X-Real-IP $verified_client_ip;',
      'X-Forwarded-For $verified_client_ip;',
      'Forwarded "";',
      'ssl_verify_client on;',
      'cloudflare-origin-pull-ca.pem',
      'server 127.0.0.1:3000;',
    ];
    for (const marker of requiredMarkers) {
      if (!config.includes(marker)) errors.push(`production Nginx configuration lacks: ${marker}`);
    }
    if (/set_real_ip_from\s+(?:0\.0\.0\.0\/0|::\/0)/u.test(config + realIp)) {
      errors.push('wildcard trusted proxy networks are forbidden');
    }
    if (/\$proxy_add_x_forwarded_for/u.test(config)) {
      errors.push('$proxy_add_x_forwarded_for is forbidden for canonical identity');
    }
    if (/proxy_set_header\s+X-Origin-(?:Verified-Client-IP|Proxy-Attestation)\s+\$http_/iu.test(config)) {
      errors.push('private identity headers must be overwritten, not copied from the request');
    }
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestSource ?? '');
  } catch {
    errors.push('Cloudflare CIDR manifest must be valid JSON');
  }
  if (!Array.isArray(manifest?.ipv4) || manifest.ipv4.length === 0) {
    errors.push('Cloudflare CIDR manifest must contain IPv4 ranges');
  }
  if (!Array.isArray(manifest?.ipv6) || manifest.ipv6.length === 0) {
    errors.push('Cloudflare CIDR manifest must contain IPv6 ranges');
  }
  if (!realIp || !geo) errors.push('both generated Cloudflare Nginx includes are required');

  try {
    const lock = JSON.parse(imageSource ?? '');
    if (`${lock.repository ?? ''}@${lock.digest ?? ''}` !== EXPECTED_NGINX_IMAGE
      || lock.mediaType !== 'application/vnd.oci.image.index.v1+json') {
      errors.push('Nginx must use the approved multi-platform digest-pinned official image');
    }
  } catch {
    errors.push('Nginx image lock must be valid JSON');
  }

  if (!systemd?.includes('Environment=HOSTNAME=127.0.0.1')
    || !systemd.includes('Environment=PORT=3000')) {
    errors.push('the host application upstream must bind only to 127.0.0.1:3000');
  }
  if (!orchestrator?.includes('export HOSTNAME="127.0.0.1"')) {
    errors.push('the production orchestrator must enforce loopback application binding');
  }
  if (!runtimeSchema?.includes('ORIGIN_PROXY_SHARED_SECRET')
    || !runtimeSchema.includes('64-character hexadecimal secret')
    || !runtimeSchema.includes('non-placeholder')) {
    errors.push('production startup must validate the origin-proxy shared secret');
  }
  if (runtimeSchema && /TRUST_PROXY_MODE|CLIENT_IP_HEADER/u.test(runtimeSchema)) {
    errors.push('direct public forwarding-header trust configuration is forbidden');
  }
  if (!identitySource?.includes("timingSafeEqual")
    || !identitySource.includes("x-origin-verified-client-ip")
    || !identitySource.includes("x-origin-proxy-attestation")) {
    errors.push('application identity must validate the private IP and attestation in constant time');
  }
  if (identitySource && /headers\.get\(['"](?:cf-connecting-ip|x-forwarded-for|x-real-ip|forwarded)['"]\)/iu.test(identitySource)) {
    errors.push('application identity must not read public forwarding headers as candidates');
  }

  for (const marker of ['firewall', 'IPv4', 'IPv6', 'Authenticated Origin Pull', 'Full (strict)', 'rollback', 'rotation']) {
    if (!runbook?.includes(marker)) errors.push(`origin ingress runbook lacks: ${marker}`);
  }

  for (const relative of await filesBelow(path.join(root, 'deploy/nginx'), root)) {
    if (/\.(?:key|pem|p12|pfx|crt)$/iu.test(relative)) {
      errors.push(`secret or certificate material is forbidden in the repository: ${relative}`);
    }
  }

  const productionCompose = await readOptional(path.join(root, 'docker/docker-compose.prod.yml'));
  const publiclyPublishesApplication = productionCompose?.split('\n').some((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) return false;
    const mapping = trimmed.slice(1).trim().replaceAll('"', '').replaceAll("'", '');
    if (!mapping.endsWith('3000:3000')) return false;
    return !mapping.startsWith('127.0.0.1:') && !mapping.startsWith('[::1]:');
  });
  if (publiclyPublishesApplication) {
    errors.push('the application port must not be publicly published');
  }
}

async function validateLayeredRateLimiting(root, errors) {
  const config = await readOptional(path.join(root, 'deploy/nginx/nginx.conf.template'));
  const readiness = await readOptional(path.join(root, 'src/app/api/health/ready/route.ts'));
  const limiter = await readOptional(path.join(root, 'src/lib/sensitiveRateLimit.ts'));
  const retention = await readOptional(path.join(root, 'src/lib/operationalMonitor.ts'));
  const contract = await readOptional(path.join(root, 'docs/security/layered-rate-limiting.md'));

  for (const marker of [
    'zone=auth_operations:',
    'zone=public_writes:',
    'zone=broad_api:',
    'limit_conn_zone',
    'limit_req_dry_run on;',
    'limit_conn_dry_run on;',
    'limit_req_status 429;',
    'limit_conn_status 429;',
    'limit_req=$limit_req_status',
  ]) {
    if (!config?.includes(marker)) errors.push(`layered Nginx rate limiting lacks: ${marker}`);
  }

  if (!readiness?.includes('return databaseReady();')) {
    errors.push('readiness must depend on the critical PostgreSQL/schema check');
  }
  if (readiness && /(?:upstash|redis|cloudflare\s+api)/iu.test(readiness)) {
    errors.push('readiness must not depend on an external rate-limiting service');
  }
  if (!limiter?.includes('prisma.$transaction')
    || !limiter.includes('ApiErrorCode.SERVICE_UNAVAILABLE')) {
    errors.push('sensitive PostgreSQL limiter must be atomic and fail closed with generic 503');
  }
  if (!retention?.includes('prisma.rateLimit.deleteMany')) {
    errors.push('persistent limiter retention cleanup is required');
  }
  for (const marker of [
    'Cloudflare Free',
    'public reads',
    'PostgreSQL',
    'dry-run',
    '429',
    '503',
    'key cardinality',
    'false positives',
    'new reviewed ADR',
  ]) {
    if (!contract?.includes(marker)) errors.push(`layered rate-limiting contract lacks: ${marker}`);
  }

  const activeFiles = [
    ...await filesBelow(path.join(root, 'src'), root),
    ...await filesBelow(path.join(root, 'scripts'), root),
    ...await filesBelow(path.join(root, 'deploy'), root),
    ...await filesBelow(path.join(root, 'docker'), root),
    '.env.example',
    'package.json',
  ].filter((relative) => !POLICY_SELF_FILES.has(relative));
  const forbiddenExternalLimiter = /(?:UPSTASH_REDIS_REST_|RATE_LIMIT_BACKEND|RATE_LIMIT_NAMESPACE|@upstash\/|lib\/upstash|upstash\.com)/iu;
  for (const relative of activeFiles) {
    const source = await readOptional(path.join(root, relative));
    if (source && forbiddenExternalLimiter.test(source)) {
      errors.push(`${relative}: mandatory external rate-limiter configuration is forbidden`);
    }
  }
}

async function validateLocalDefaults(root, errors) {
  const makefile = await readOptional(path.join(root, 'Makefile'));
  if (makefile === undefined || !/^PROFILE \?= development$/mu.test(makefile)
    || /^PROFILE \?= production$/mu.test(makefile)) {
    errors.push('Makefile must default to the development profile');
  }

  const orchestrator = await readOptional(path.join(root, 'scripts/system-orchestrator.sh'));
  if (orchestrator === undefined || !/^PROFILE="development"$/mu.test(orchestrator)
    || /^PROFILE="production"$/mu.test(orchestrator)
    || !/Runtime profile \(default: development\)/u.test(orchestrator)) {
    errors.push('system orchestrator must default to development in code and usage text');
  }
}

async function validateVerifyImplementation(root, errors) {
  const source = await readOptional(path.join(root, 'scripts/verify-release.mjs'));
  if (source === undefined) {
    errors.push('scripts/verify-release.mjs is required');
    return;
  }
  for (const marker of [
    "from './lib/release-gates.mjs'",
    'spawn(',
    'shell: false',
    'RELEASE_GATES',
    "'GITLEAKS_BIN'",
  ]) {
    if (!source.includes(marker)) errors.push(`verify:release must retain restricted marker: ${marker}`);
  }
  if (/\bexec(?:Sync|File|FileSync)?\s*\(/u.test(source)) {
    errors.push('verify:release must use argument-vector process spawning, not exec APIs');
  }
  for (const [label, pattern] of FORBIDDEN_DEPLOY_COMMANDS) {
    if (pattern.test(source)) errors.push(`${label} is forbidden in verify:release`);
  }
  if (/\b(?:prisma\s+migrate|migrate\s+deploy|system:migrate|db:migrate)\b/iu.test(source)) {
    errors.push('persistent migration commands are forbidden in verify:release');
  }
}

async function validateSecretScanning(root, errors) {
  const toolLockSource = await readOptional(
    path.join(root, 'config/secret-scanning/tool.lock.json'),
  );
  if (toolLockSource === undefined) {
    errors.push('checksum-locked secret scanner metadata is required');
  } else {
    try {
      if (JSON.stringify(JSON.parse(toolLockSource)) !== JSON.stringify(EXPECTED_SECRET_TOOL_LOCK)) {
        errors.push('secret scanner tool lock must match the reviewed Gitleaks 8.30.1 artifact');
      }
    } catch {
      errors.push('secret scanner tool lock must contain valid JSON');
    }
  }

  const historicalSource = await readOptional(
    path.join(root, 'config/secret-scanning/historical-incident-baseline.json'),
  );
  if (historicalSource === undefined) {
    errors.push('the redacted IR-01 historical baseline is required');
  } else {
    try {
      const historical = JSON.parse(historicalSource);
      const actual = historical.findings?.map((finding) => [
        finding.classification,
        finding.fingerprint,
      ]);
      if (historical.schemaVersion !== 1
        || historical.incident !== 'IR-01'
        || historical.status !== 'COMPLETE_CONTAINED'
        || JSON.stringify(actual) !== JSON.stringify(EXPECTED_HISTORICAL_SECRET_BASELINE)) {
        errors.push('IR-01 baseline must contain exactly the six reviewed redacted fingerprints');
      }
    } catch {
      errors.push('IR-01 historical baseline must contain valid JSON');
    }
  }

  const fixtureSource = await readOptional(
    path.join(root, 'config/secret-scanning/current-fixture-allowlist.json'),
  );
  if (fixtureSource === undefined) {
    errors.push('the location-exact current secret-fixture allowlist is required');
  } else {
    try {
      const fixture = JSON.parse(fixtureSource);
      const actual = fixture.findings?.map((finding) => [
        finding.classification,
        finding.path,
        finding.rule,
        finding.line,
        finding.column,
      ]);
      if (fixture.schemaVersion !== 1
        || JSON.stringify(actual) !== JSON.stringify(EXPECTED_CURRENT_SECRET_FIXTURES)) {
        errors.push('current secret-fixture allowlist must match the reviewed exact locations');
      }
    } catch {
      errors.push('current secret-fixture allowlist must contain valid JSON');
    }
  }

  const config = await readOptional(path.join(root, 'config/secret-scanning/gitleaks.toml'));
  if (config === undefined
    || !/useDefault\s*=\s*true/u.test(config)
    || !/credential-bearing-database-url/u.test(config)
    || !/private-key-material/u.test(config)) {
    errors.push('secret scanner must extend maintained defaults with database URL and private-key rules');
  }

  const scanner = await readOptional(path.join(root, 'scripts/check-secrets.mjs'));
  for (const marker of [
    '--report-path',
    'mode: 0o600',
    'await rm(reportPath, { force: true })',
    'classifyGeneratedArtifactFinding',
    'git',
    'ls-files',
    'current-fixture-allowlist.json',
    'historical-incident-baseline.json',
    "'.next/standalone'",
    'ENV_FILE_PATTERN',
    'GITLEAKS_BIN',
    'binarySha256',
    'formatFinding',
  ]) {
    if (scanner === undefined || !scanner.includes(marker)) {
      errors.push(`secret-scanning gate must retain restricted marker: ${marker}`);
    }
  }
  if (await exists(path.join(root, '.gitleaksignore'))) {
    errors.push('global .gitleaksignore suppression is forbidden');
  }

  const dockerIgnore = await readOptional(path.join(root, '.dockerignore'));
  if (dockerIgnore === undefined
    || !/(?:^|\n)\.env(?:\n|$)/u.test(dockerIgnore)
    || !/(?:^|\n)\.env\.\*(?:\n|$)/u.test(dockerIgnore)
    || !/(?:^|\n)!\.env\.example(?:\n|$)/u.test(dockerIgnore)) {
    errors.push('Docker inputs must exclude ignored .env files while retaining .env.example');
  }

  if (!await exists(path.join(root, 'docs/security/secret-scanning.md'))) {
    errors.push('secret-scanning and sanitized IR-01 documentation is required');
  }
}

async function validateClaimTokenTransport(root, errors) {
  const activeFiles = await filesBelow(path.join(root, 'src'), root);
  for (const relative of activeFiles) {
    const source = await readFile(path.join(root, relative), 'utf8');
    if (/[?&#]claim(?:Token)?=/iu.test(source)
      || /(?:search|searchParams?)\.get\(\s*['"]claim(?:Token)?['"]\s*\)/u.test(source)
      || /(?:search|searchParams?)\.set\(\s*['"]claim(?:Token)?['"]/u.test(source)
      || /claim-link/u.test(source)) {
      errors.push(`${relative}: claim capabilities must not be created or consumed through URLs`);
    }
  }

  const guestClient = await readOptional(
    path.join(root, 'src/app/[locale]/guest/UnifiedGuestClient.tsx'),
  );
  for (const marker of [
    "current.searchParams.delete('claim')",
    "current.searchParams.delete('claimToken')",
    'window.history.replaceState',
    "'/api/portal/claim-exchange'",
  ]) {
    if (guestClient === undefined || !guestClient.includes(marker)) {
      errors.push(`guest claim transport must retain sanitization marker: ${marker}`);
    }
  }

  const exchangeRoute = await readOptional(
    path.join(root, 'src/app/api/portal/claim-exchange/route.ts'),
  );
  for (const marker of [
    'prepareBookingClaimExchange',
    'createPortalClaimExchangeCookie',
    'checkSensitiveRateLimit',
    'readJsonBody',
  ]) {
    if (exchangeRoute === undefined || !exchangeRoute.includes(marker)) {
      errors.push(`server-controlled claim exchange must retain marker: ${marker}`);
    }
  }

  const claimRoute = await readOptional(path.join(root, 'src/app/api/portal/claims/route.ts'));
  if (claimRoute === undefined
    || !claimRoute.includes('readPortalClaimExchange')
    || !claimRoute.includes('clearPresentedPortalClaimExchange')
    || /\bclaimToken\s*:/u.test(claimRoute)) {
    errors.push('claim consumption must use and clear only the server-controlled exchange cookie');
  }

  const cookieContract = await readOptional(path.join(root, 'src/lib/portalClaimExchange.ts'));
  for (const marker of [
    'httpOnly: true',
    "secure: process.env.NODE_ENV === 'production'",
    "sameSite: 'strict'",
    "path: '/api/portal'",
    'PORTAL_CLAIM_EXCHANGE_MAX_AGE_SECONDS',
    'grantLifetimeSeconds',
    'maxAge: 0',
    'cache-control',
    'no-referrer',
  ]) {
    if (cookieContract === undefined || !cookieContract.includes(marker)) {
      errors.push(`claim exchange cookie must retain security marker: ${marker}`);
    }
  }

  const proxy = await readOptional(path.join(root, 'src/proxy.ts'));
  if (proxy === undefined
    || !/\/guest/u.test(proxy)
    || !/Referrer-Policy['"],\s*['"]no-referrer/u.test(proxy)) {
    errors.push('guest claim UI must enforce Referrer-Policy: no-referrer');
  }

  const nginx = await readOptional(path.join(root, 'deploy/nginx/nginx.conf.template'));
  if (nginx === undefined || !nginx.includes('$uri') || nginx.includes('$request_uri')) {
    errors.push('Nginx logging must exclude query strings from the claim transport');
  }

  const adminGrant = await readOptional(
    path.join(root, 'src/app/api/admin/bookings/[id]/claim-grants/route.ts'),
  );
  if (adminGrant === undefined
    || !adminGrant.includes("'cache-control', 'no-store'")
    || !adminGrant.includes("'referrer-policy', 'no-referrer'")) {
    errors.push('admin claim issuance must return no-store and no-referrer headers');
  }

  if (!await exists(path.join(root, 'docs/security/claim-token-transport.md'))) {
    errors.push('claim capability transport documentation is required');
  }
}

function dockerLogicalLines(source) {
  const logicalLines = [];
  let pending = '';

  for (const rawLine of source.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (pending === '' && (trimmed === '' || trimmed.startsWith('#'))) continue;

    const continued = /\\\s*$/u.test(rawLine);
    const fragment = trimmed.replace(/\\\s*$/u, '').trim();
    pending = pending === '' ? fragment : `${pending} ${fragment}`;
    if (!continued) {
      logicalLines.push(pending);
      pending = '';
    }
  }

  if (pending !== '') logicalLines.push(pending);
  return logicalLines;
}

function resolveImagePath(workdir, value, source, sourceIsDirectory) {
  const resolved = value.startsWith('/')
    ? path.posix.normalize(value)
    : path.posix.resolve(workdir, value);
  if (value.endsWith('/') && !sourceIsDirectory) {
    return path.posix.join(resolved, path.posix.basename(source));
  }
  return resolved;
}

function safeDockerStageName(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && [...value].every((character) => (
      /[A-Za-z0-9_.-]/u.test(character)
    ));
}

function parseFinalDockerCopies(source, errors) {
  const stages = [];
  let currentStage;

  for (const instruction of dockerLogicalLines(source)) {
    const fromTokens = instruction.split(/\s+/u);
    if (fromTokens[0]?.toUpperCase() === 'FROM') {
      const validShape = fromTokens.length === 2
        || (fromTokens.length === 4 && fromTokens[2]?.toUpperCase() === 'AS'
          && safeDockerStageName(fromTokens[3]));
      if (!validShape) {
        errors.push('docker/Dockerfile.security FROM instructions must use a static stage form');
        continue;
      }
      currentStage = {
        name: fromTokens[3]?.toLowerCase(),
        instructions: [],
      };
      stages.push(currentStage);
      continue;
    }
    if (currentStage) currentStage.instructions.push(instruction);
  }

  const finalStage = stages.at(-1);
  if (!finalStage) {
    errors.push('docker/Dockerfile.security must contain a final runtime stage');
    return {
      commandModule: undefined,
      commandTarget: undefined,
      copies: [],
      finalInstructions: [],
      finalRuns: [],
      postCopyRuns: [],
      workdir: undefined,
    };
  }
  const builderStages = stages
    .slice(0, -1)
    .filter((stage) => stage.name === 'builder');
  if (builderStages.length !== 1 || finalStage.name === 'builder') {
    errors.push('docker/Dockerfile.security must contain one distinct prior builder stage');
  }

  let workdir = '/';
  let commandModule;
  let commandTarget;
  const copies = [];
  const finalRuns = [];
  const postCopyRuns = [];
  let sawCopy = false;
  for (const instruction of finalStage.instructions) {
    const workdirMatch = instruction.match(/^WORKDIR\s+(\S+)$/iu);
    if (workdirMatch) {
      if (/[${}\\[\]*?]/u.test(workdirMatch[1])) {
        errors.push('docker/Dockerfile.security final WORKDIR must be a static path');
      } else {
        workdir = workdirMatch[1].startsWith('/')
          ? path.posix.normalize(workdirMatch[1])
          : path.posix.resolve(workdir, workdirMatch[1]);
      }
      continue;
    }
    const commandMatch = instruction.match(/^CMD\s+(.+)$/iu);
    if (commandMatch) {
      try {
        const command = JSON.parse(commandMatch[1]);
        const candidate = Array.isArray(command) ? command[1] : undefined;
        const normalized = typeof candidate === 'string'
          ? path.posix.normalize(candidate)
          : undefined;
        const target = Array.isArray(command) ? command[2] : undefined;
        const normalizedTarget = typeof target === 'string'
          ? path.posix.normalize(target)
          : undefined;
        if (command[0] !== 'node' || !normalized
          || normalized === '..' || normalized.startsWith('../')
          || path.posix.isAbsolute(normalized)
          || !RUNTIME_MODULE_EXTENSIONS.has(path.posix.extname(normalized))
          || !normalizedTarget
          || normalizedTarget === '..' || normalizedTarget.startsWith('../')
          || path.posix.isAbsolute(normalizedTarget)
          || !RUNTIME_MODULE_EXTENSIONS.has(path.posix.extname(normalizedTarget))) {
          throw new Error('unsupported runtime command');
        }
        commandModule = normalized;
        commandTarget = normalizedTarget;
      } catch {
        errors.push('docker/Dockerfile.security final CMD must name a static Node runtime module');
      }
      continue;
    }
    if (/^RUN(?:\s|$)/iu.test(instruction)) {
      finalRuns.push(instruction);
      if (sawCopy) postCopyRuns.push(instruction);
      continue;
    }
    if (/^ADD(?:\s|$)/iu.test(instruction)) {
      errors.push('docker/Dockerfile.security final ADD instructions are forbidden');
      continue;
    }
    if (!/^COPY(?:\s|$)/iu.test(instruction)) continue;
    sawCopy = true;

    const body = instruction.replace(/^COPY\s+/iu, '').trim();
    if (body.startsWith('[')) {
      errors.push('docker/Dockerfile.security final COPY must use an unambiguous static form');
      continue;
    }

    const tokens = body.split(/\s+/u);
    let from;
    let supported = true;
    while (tokens[0]?.startsWith('--')) {
      const option = tokens.shift();
      if (option.startsWith('--from=')) from = option.slice('--from='.length);
      else if (!option.startsWith('--chown=')) supported = false;
    }
    if (!supported || tokens.length !== 2
      || tokens.some((token) => /["'${}\\[\]*?]/u.test(token))) {
      errors.push('docker/Dockerfile.security final COPY must use an unambiguous static form');
      continue;
    }

    const [rawSource, rawDestination] = tokens;
    const normalizedSource = path.posix.normalize(
      rawSource.startsWith('/') ? rawSource : `/${rawSource}`,
    );
    copies.push({
      order: copies.length,
      source: normalizedSource,
      destination: rawDestination,
      from: from?.toLowerCase(),
      isBuildContext: from === undefined,
      workdir,
    });
  }

  if (!commandModule) {
    errors.push('docker/Dockerfile.security final CMD must name a static Node runtime module');
  }
  return {
    commandModule,
    commandTarget,
    copies,
    finalInstructions: finalStage.instructions,
    finalRuns,
    postCopyRuns,
    workdir,
  };
}

function validPackageNamePart(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 214) return false;
  const first = value.codePointAt(0);
  const isAsciiLetterOrDigit = (code) => (
    (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
  );
  if (!isAsciiLetterOrDigit(first)) return false;
  return [...value].every((character) => {
    const code = character.codePointAt(0);
    return isAsciiLetterOrDigit(code) || character === '.' || character === '_'
      || character === '-';
  });
}

function packageNameFromSpecifier(specifier) {
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    const scope = parts[0]?.slice(1);
    const name = parts[1];
    return validPackageNamePart(scope) && validPackageNamePart(name)
      ? `@${scope}/${name}`
      : undefined;
  }
  return validPackageNamePart(parts[0]) ? parts[0] : undefined;
}

function analyzeRuntimeModule(relative, source, errors) {
  const sourceFile = ts.createSourceFile(
    relative,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    errors.push(`runtime module must contain valid JavaScript syntax: ${relative}`);
    return {
      nonLiteralDynamicImports: [],
      nonLiteralRequires: 0,
      sourceFile,
      specifiers: [],
      unsupportedRuntimeDataAccesses: 0,
      unsupportedRuntimeLoaders: 0,
    };
  }

  const specifiers = new Set();
  const nonLiteralDynamicImports = [];
  let nonLiteralRequires = 0;
  let unsupportedRuntimeDataAccesses = 0;
  let unsupportedRuntimeLoaders = 0;
  function addLiteral(node) {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      specifiers.add(node.text);
      return true;
    }
    return false;
  }
  function visit(node) {
    const isProcessGetBuiltinModule = (ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'process'
      && node.name.text === 'getBuiltinModule')
      || (ts.isElementAccessExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'process'
        && node.argumentExpression
        && ts.isStringLiteral(node.argumentExpression)
        && node.argumentExpression.text === 'getBuiltinModule');
    if (isProcessGetBuiltinModule) {
      unsupportedRuntimeLoaders += 1;
    }
    const isProcessLoadEnvFile = (ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'process'
      && node.name.text === 'loadEnvFile')
      || (ts.isElementAccessExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'process'
        && node.argumentExpression
        && ts.isStringLiteral(node.argumentExpression)
        && node.argumentExpression.text === 'loadEnvFile');
    if (isProcessLoadEnvFile) {
      unsupportedRuntimeDataAccesses += 1;
    }
    if (ts.isIdentifier(node) && node.text === 'getBuiltinModule') {
      unsupportedRuntimeLoaders += 1;
    }
    if (ts.isIdentifier(node) && node.text === 'loadEnvFile') {
      unsupportedRuntimeDataAccesses += 1;
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addLiteral(node.moduleSpecifier);
      if (ts.isStringLiteral(node.moduleSpecifier)
        && RUNTIME_LOADER_MODULE_SPECIFIERS.has(node.moduleSpecifier.text)) {
        unsupportedRuntimeLoaders += 1;
      }
      if (ts.isStringLiteral(node.moduleSpecifier)
        && RUNTIME_DATA_MODULE_SPECIFIERS.has(node.moduleSpecifier.text)) {
        unsupportedRuntimeDataAccesses += 1;
      }
    } else if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)) {
      addLiteral(node.moduleReference.expression);
      if (node.moduleReference.expression
        && ts.isStringLiteral(node.moduleReference.expression)
        && RUNTIME_LOADER_MODULE_SPECIFIERS.has(node.moduleReference.expression.text)) {
        unsupportedRuntimeLoaders += 1;
      }
      if (node.moduleReference.expression
        && ts.isStringLiteral(node.moduleReference.expression)
        && RUNTIME_DATA_MODULE_SPECIFIERS.has(node.moduleReference.expression.text)) {
        unsupportedRuntimeDataAccesses += 1;
      }
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const isModuleRequire = (ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'module'
        && node.expression.name.text === 'require')
        || (ts.isElementAccessExpression(node.expression)
          && ts.isIdentifier(node.expression.expression)
          && node.expression.expression.text === 'module'
          && node.expression.argumentExpression
          && ts.isStringLiteral(node.expression.argumentExpression)
          && node.expression.argumentExpression.text === 'require');
      const isRequireResolve = ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'require'
        && node.expression.name.text === 'resolve';
      if (isDynamicImport || isRequire) {
        const firstArgument = node.arguments[0];
        const isLiteral = firstArgument ? addLiteral(firstArgument) : false;
        const hasSupportedArity = node.arguments.length === 1;
        if ((!isLiteral || !hasSupportedArity) && isDynamicImport) {
          nonLiteralDynamicImports.push(firstArgument ?? node);
        }
        if ((!isLiteral || !hasSupportedArity) && isRequire) nonLiteralRequires += 1;
      }
      if (isModuleRequire || isRequireResolve) {
        if (node.arguments[0]) addLiteral(node.arguments[0]);
        unsupportedRuntimeLoaders += 1;
      }
      if ((isRequire || isDynamicImport)
        && node.arguments[0]
        && (ts.isStringLiteral(node.arguments[0])
          || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
        && RUNTIME_LOADER_MODULE_SPECIFIERS.has(node.arguments[0].text)) {
        unsupportedRuntimeLoaders += 1;
      }
      if ((isRequire || isDynamicImport)
        && node.arguments[0]
        && (ts.isStringLiteral(node.arguments[0])
          || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
        && RUNTIME_DATA_MODULE_SPECIFIERS.has(node.arguments[0].text)) {
        unsupportedRuntimeDataAccesses += 1;
      }
    } else if ((ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && ((node.expression.text === 'module' && node.name.text === 'require')
        || (node.expression.text === 'require' && node.name.text === 'resolve')))
      || (ts.isElementAccessExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'module'
        && node.argumentExpression
        && ts.isStringLiteral(node.argumentExpression)
        && node.argumentExpression.text === 'require')) {
      unsupportedRuntimeLoaders += 1;
    } else if (ts.isIdentifier(node)
      && node.text === 'require'
      && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
      unsupportedRuntimeLoaders += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return {
    nonLiteralDynamicImports,
    nonLiteralRequires,
    sourceFile,
    specifiers: [...specifiers].sort(),
    unsupportedRuntimeDataAccesses,
    unsupportedRuntimeLoaders,
  };
}

function importedBinding(sourceFile, moduleSpecifier, importedName) {
  const matches = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== moduleSpecifier
      || !statement.importClause?.namedBindings
      || !ts.isNamedImports(statement.importClause.namedBindings)) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === importedName) {
        matches.push({
          declaration: element.name,
          localName: element.name.text,
        });
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function isBindingDeclarationIdentifier(identifier) {
  const parent = identifier.parent;
  return (ts.isVariableDeclaration(parent) && parent.name === identifier)
    || (ts.isParameter(parent) && parent.name === identifier)
    || (ts.isBindingElement(parent) && parent.name === identifier)
    || (ts.isImportClause(parent) && parent.name === identifier)
    || (ts.isImportSpecifier(parent) && parent.name === identifier)
    || (ts.isNamespaceImport(parent) && parent.name === identifier)
    || (ts.isImportEqualsDeclaration(parent) && parent.name === identifier)
    || ((ts.isFunctionDeclaration(parent)
      || ts.isFunctionExpression(parent)
      || ts.isClassDeclaration(parent)
      || ts.isClassExpression(parent)
      || ts.isEnumDeclaration(parent)
      || ts.isModuleDeclaration(parent)
      || ts.isTypeAliasDeclaration(parent)
      || ts.isInterfaceDeclaration(parent))
      && parent.name === identifier);
}

function expressionContainsIdentifier(node, names) {
  let found = false;
  function visit(current) {
    if (found) return;
    if (ts.isIdentifier(current) && names.has(current.text)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function processAccessPath(node) {
  if (ts.isIdentifier(node)) {
    return node.text === 'process' ? [] : undefined;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const parentPath = processAccessPath(node.expression);
    return parentPath ? [...parentPath, node.name.text] : undefined;
  }
  if (ts.isElementAccessExpression(node)) {
    const parentPath = processAccessPath(node.expression);
    if (!parentPath) return undefined;
    const argument = node.argumentExpression;
    const segment = argument
      && (ts.isStringLiteral(argument) || ts.isNumericLiteral(argument))
      ? argument.text
      : '*';
    return [...parentPath, segment];
  }
  return undefined;
}

function expressionWritesProcessOrArgv(node) {
  let unsafe = false;
  function visit(current) {
    if (unsafe) return;
    const accessPath = processAccessPath(current);
    if (accessPath) {
      unsafe = accessPath.length === 0
        || accessPath[0] === 'argv'
        || accessPath[0] === '*';
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return unsafe;
}

function hasUnexpectedProcessArgvAccess(sourceFile, expectedAccess) {
  let unsafe = false;
  function visit(node) {
    if (unsafe) return;
    if (ts.isIdentifier(node)
      && (node.text === 'globalThis' || node.text === 'global')) {
      unsafe = true;
      return;
    }
    const accessPath = processAccessPath(node);
    if (accessPath) {
      const isExpectedArgvAccess = node === expectedAccess;
      const isAllowedNonArgvAccess = accessPath.length > 0
        && (accessPath[0] === 'env' || accessPath[0] === 'exitCode');
      if (!isExpectedArgvAccess && !isAllowedNonArgvAccess) unsafe = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return unsafe;
}

function hasCompetingBindingOrWrite(
  sourceFile,
  expectedBindings,
  forbiddenBindingNames = new Set(),
) {
  const expectedByName = new Map(
    [...expectedBindings].map((declaration) => [declaration.text, declaration]),
  );
  const protectedNames = new Set([
    ...expectedByName.keys(),
    ...forbiddenBindingNames,
  ]);
  const protectedWriteNames = new Set(expectedByName.keys());
  let unsafe = false;

  function visit(node) {
    if (unsafe) return;
    if (ts.isIdentifier(node)
      && protectedNames.has(node.text)
      && isBindingDeclarationIdentifier(node)
      && expectedByName.get(node.text) !== node) {
      unsafe = true;
      return;
    }
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      && (expressionContainsIdentifier(node.left, protectedWriteNames)
        || expressionWritesProcessOrArgv(node.left))) {
      unsafe = true;
      return;
    }
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && (node.operator === ts.SyntaxKind.PlusPlusToken
        || node.operator === ts.SyntaxKind.MinusMinusToken)
      && (expressionContainsIdentifier(node.operand, protectedWriteNames)
        || expressionWritesProcessOrArgv(node.operand))) {
      unsafe = true;
      return;
    }
    if ((ts.isForInStatement(node) || ts.isForOfStatement(node))
      && !ts.isVariableDeclarationList(node.initializer)
      && (expressionContainsIdentifier(node.initializer, protectedWriteNames)
        || expressionWritesProcessOrArgv(node.initializer))) {
      unsafe = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return unsafe;
}

function commandTargetArgumentIndex(sourceFile, dynamicArgument) {
  if (!ts.isPropertyAccessExpression(dynamicArgument)
    || dynamicArgument.name.text !== 'href'
    || !ts.isCallExpression(dynamicArgument.expression)) {
    return undefined;
  }
  const urlCall = dynamicArgument.expression;
  const urlBinding = importedBinding(sourceFile, 'node:url', 'pathToFileURL');
  if (!urlBinding || !ts.isIdentifier(urlCall.expression)
    || urlCall.expression.text !== urlBinding.localName || urlCall.arguments.length !== 1
    || !ts.isCallExpression(urlCall.arguments[0])) {
    return undefined;
  }
  const resolveCall = urlCall.arguments[0];
  const resolveBinding = importedBinding(sourceFile, 'node:path', 'resolve');
  if (!resolveBinding || !ts.isIdentifier(resolveCall.expression)
    || resolveCall.expression.text !== resolveBinding.localName || resolveCall.arguments.length !== 1
    || !ts.isIdentifier(resolveCall.arguments[0])) {
    return undefined;
  }
  const targetVariable = resolveCall.arguments[0].text;

  let current = dynamicArgument;
  while (current.parent && !ts.isSourceFile(current.parent)) {
    if (ts.isFunctionLike(current.parent)) return undefined;
    current = current.parent;
  }
  if (!ts.isSourceFile(current.parent)) return undefined;

  const candidates = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)
      || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === targetVariable) {
        candidates.push(declaration);
      }
    }
  }
  if (candidates.length !== 1) return undefined;
  const [targetDeclaration] = candidates;
  const initializer = targetDeclaration.initializer;
  if (!initializer
    || !ts.isElementAccessExpression(initializer)
    || !ts.isPropertyAccessExpression(initializer.expression)
    || !ts.isIdentifier(initializer.expression.expression)
    || initializer.expression.expression.text !== 'process'
    || initializer.expression.name.text !== 'argv'
    || !initializer.argumentExpression
    || !ts.isNumericLiteral(initializer.argumentExpression)) {
    return undefined;
  }
  if (hasUnexpectedProcessArgvAccess(sourceFile, initializer)) return undefined;
  if (hasCompetingBindingOrWrite(sourceFile, new Set([
    targetDeclaration.name,
    urlBinding.declaration,
    resolveBinding.declaration,
  ]), new Set(['process']))) {
    return undefined;
  }
  return Number.parseInt(initializer.argumentExpression.text, 10);
}

function isWithinDirectory(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..'
    && !path.isAbsolute(relative));
}

function isWithinImageDirectory(candidate, directory) {
  const relative = path.posix.relative(directory, candidate);
  return relative !== ''
    && !relative.startsWith('../')
    && relative !== '..'
    && !path.posix.isAbsolute(relative);
}

function imagePathsOverlap(left, right) {
  return left === right
    || isWithinImageDirectory(left, right)
    || isWithinImageDirectory(right, left);
}

async function validateSecurityImageRuntimeClosure(root, errors) {
  const dockerRelative = 'docker/Dockerfile.security';
  const dockerSource = await readOptional(path.join(root, dockerRelative));
  if (dockerSource === undefined) {
    errors.push(`${dockerRelative} is required`);
    return;
  }

  const {
    commandModule,
    commandTarget,
    copies,
    finalInstructions,
    finalRuns,
    postCopyRuns,
    workdir,
  } = parseFinalDockerCopies(
    dockerSource,
    errors,
  );
  const allowedFinalRuns = new Set([
    EXPECTED_RUNTIME_SETUP_RUN,
    EXPECTED_POST_COPY_RUNTIME_HARDENING_RUN,
  ]);
  for (const instruction of finalRuns) {
    if (!allowedFinalRuns.has(instruction)) {
      errors.push(`${dockerRelative}: unmodeled final-stage RUN instruction`);
    }
  }
  for (const instruction of postCopyRuns) {
    if (instruction !== EXPECTED_POST_COPY_RUNTIME_HARDENING_RUN) {
      errors.push(`${dockerRelative}: unmodeled RUN after runtime files were copied`);
    }
  }
  const copyIndexes = [];
  const setupRunIndexes = [];
  const hardeningRunIndexes = [];
  const runtimeUserIndexes = [];
  const runtimeEntrypointIndexes = [];
  const runtimeCommandIndexes = [];
  const runtimeEnvironmentIndexes = [];
  const runtimeHealthcheckIndexes = [];
  const allowedFinalInstructions = new Set([
    'ARG',
    'CMD',
    'COPY',
    'ENTRYPOINT',
    'ENV',
    'EXPOSE',
    'HEALTHCHECK',
    'LABEL',
    'RUN',
    'STOPSIGNAL',
    'USER',
    'WORKDIR',
  ]);
  for (const [index, instruction] of finalInstructions.entries()) {
    const instructionName = instruction.split(/\s+/u, 1)[0]?.toUpperCase();
    if (!allowedFinalInstructions.has(instructionName)) {
      errors.push(`${dockerRelative}: unmodeled final-stage instruction`);
    }
    if (/^COPY(?:\s|$)/iu.test(instruction)) copyIndexes.push(index);
    if (instruction === EXPECTED_RUNTIME_SETUP_RUN) setupRunIndexes.push(index);
    if (instruction === EXPECTED_POST_COPY_RUNTIME_HARDENING_RUN) {
      hardeningRunIndexes.push(index);
    }
    if (/^USER(?:\s|$)/iu.test(instruction)) {
      if (instruction === EXPECTED_RUNTIME_USER) runtimeUserIndexes.push(index);
      else errors.push(`${dockerRelative}: final runtime USER contract is invalid`);
    }
    if (/^ENTRYPOINT(?:\s|$)/iu.test(instruction)) {
      if (instruction === EXPECTED_RUNTIME_ENTRYPOINT) runtimeEntrypointIndexes.push(index);
      else errors.push(`${dockerRelative}: final runtime ENTRYPOINT contract is invalid`);
    }
    if (/^CMD(?:\s|$)/iu.test(instruction)) {
      if (instruction === EXPECTED_RUNTIME_COMMAND) runtimeCommandIndexes.push(index);
      else errors.push(`${dockerRelative}: final runtime CMD contract is invalid`);
    }
    if (/^ENV(?:\s|$)/iu.test(instruction)) {
      if (instruction === EXPECTED_RUNTIME_ENV) runtimeEnvironmentIndexes.push(index);
      else errors.push(`${dockerRelative}: final runtime ENV contract is invalid`);
    }
    if (/^HEALTHCHECK(?:\s|$)/iu.test(instruction)) {
      if (instruction === EXPECTED_RUNTIME_HEALTHCHECK) {
        runtimeHealthcheckIndexes.push(index);
      } else {
        errors.push(`${dockerRelative}: final runtime HEALTHCHECK contract is invalid`);
      }
    }
    if (/^SHELL(?:\s|$)/iu.test(instruction)) {
      errors.push(`${dockerRelative}: final-stage SHELL instructions are forbidden`);
    }
  }
  const [firstCopyIndex] = copyIndexes;
  const lastCopyIndex = copyIndexes.at(-1);
  const [setupRunIndex] = setupRunIndexes;
  const [hardeningRunIndex] = hardeningRunIndexes;
  const validRunContract = copyIndexes.length > 0
    && setupRunIndexes.length === 1
    && hardeningRunIndexes.length === 1
    && setupRunIndex < firstCopyIndex
    && hardeningRunIndex > lastCopyIndex;
  if (!validRunContract) {
    errors.push(`${dockerRelative}: final-stage runtime RUN contract is invalid`);
  }
  const [runtimeEnvironmentIndex] = runtimeEnvironmentIndexes;
  if (runtimeEnvironmentIndexes.length !== 1
    || !(runtimeEnvironmentIndex > setupRunIndex)
    || !(runtimeEnvironmentIndex < firstCopyIndex)) {
    errors.push(`${dockerRelative}: final runtime ENV contract is invalid`);
  }
  const [runtimeUserIndex] = runtimeUserIndexes;
  const [runtimeEntrypointIndex] = runtimeEntrypointIndexes;
  const [runtimeCommandIndex] = runtimeCommandIndexes;
  if (runtimeUserIndexes.length !== 1
    || !(runtimeUserIndex > hardeningRunIndex)) {
    errors.push(`${dockerRelative}: final runtime USER contract is invalid`);
  }
  const [runtimeHealthcheckIndex] = runtimeHealthcheckIndexes;
  if (runtimeHealthcheckIndexes.length !== 1
    || !(runtimeHealthcheckIndex > runtimeUserIndex)) {
    errors.push(`${dockerRelative}: final runtime HEALTHCHECK contract is invalid`);
  }
  if (runtimeEntrypointIndexes.length !== 1
    || !(runtimeEntrypointIndex > runtimeHealthcheckIndex)) {
    errors.push(`${dockerRelative}: final runtime ENTRYPOINT contract is invalid`);
  }
  if (runtimeCommandIndexes.length !== 1
    || !(runtimeCommandIndex > runtimeEntrypointIndex)
    || runtimeCommandIndex !== finalInstructions.length - 1) {
    errors.push(`${dockerRelative}: final runtime CMD contract is invalid`);
  }
  const forbiddenBuilderSources = new Set(['/app', '/app/src', '/app/src/lib']);
  const forbiddenContextSources = new Set([
    '/',
    '/app',
    '/app/src',
    '/app/src/lib',
    '/src',
    '/src/lib',
  ]);
  const moduleCopies = new Map();
  const moduleCopyRecords = new Map();
  const packageCopies = new Map();
  const packageDestinations = new Map();
  const standaloneRuntimeCopies = copies.filter((copy) => (
    copy.from === 'builder'
    && copy.source === '/app/.next/standalone'
  )).map((copy) => ({
    copy,
    destination: resolveImagePath(
      copy.workdir,
      copy.destination,
      copy.source,
      true,
    ),
  }));
  const standaloneRuntimeRoots = standaloneRuntimeCopies.map((record) => record.destination);
  const modeledFinalCopies = new Set(
    standaloneRuntimeCopies.map((record) => record.copy),
  );

  for (const copy of copies) {
    const broadStageCopy = !copy.isBuildContext
      && forbiddenBuilderSources.has(copy.source);
    const broadContextCopy = copy.isBuildContext
      && forbiddenContextSources.has(copy.source);
    if (broadStageCopy || broadContextCopy) {
      errors.push(`${dockerRelative}: broad repository-source COPY is forbidden`);
      continue;
    }

    const packagePrefix = '/app/node_modules/';
    if (copy.source.startsWith(packagePrefix)) {
      const packageRelative = copy.source.slice(packagePrefix.length);
      const packageName = packageNameFromSpecifier(packageRelative);
      if (packageName === packageRelative) {
        const destination = resolveImagePath(
          copy.workdir,
          copy.destination,
          copy.source,
          true,
        );
        const expectedDestination = `/app/node_modules/${packageName}`;
        if (copy.from !== 'builder' || destination !== expectedDestination) {
          errors.push(`runtime package must preserve its final-image location: ${packageName}`);
          continue;
        }
        if (packageCopies.has(packageName)
          || (packageDestinations.has(destination)
            && packageDestinations.get(destination) !== packageName)) {
          errors.push(`runtime package has an ambiguous final-image copy: ${packageName}`);
          continue;
        }
        packageCopies.set(packageName, {
          copy,
          destination,
          sourceRoot: path.join(root, 'node_modules', ...packageName.split('/')),
        });
        packageDestinations.set(destination, packageName);
        modeledFinalCopies.add(copy);
      }
      continue;
    }

    if (!copy.source.startsWith('/app/')) continue;
    const relative = copy.source.slice('/app/'.length);
    if (relative === 'public'
      && copy.from === 'builder'
      && resolveImagePath(copy.workdir, copy.destination, copy.source, true) === '/app/public') {
      modeledFinalCopies.add(copy);
      continue;
    }
    if (relative === '.next/static'
      && copy.from === 'builder'
      && resolveImagePath(
        copy.workdir,
        copy.destination,
        copy.source,
        true,
      ) === '/app/.next/static') {
      modeledFinalCopies.add(copy);
      continue;
    }
    if (relative.startsWith('.next/') || relative.startsWith('public/')) continue;
    if (!RUNTIME_MODULE_EXTENSIONS.has(path.posix.extname(relative))) continue;

    let sourceStat;
    try {
      sourceStat = await lstat(path.join(root, ...relative.split('/')));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (!sourceStat?.isFile() || sourceStat.isSymbolicLink()) {
      errors.push(`manually copied runtime module must be a regular file: ${relative}`);
      continue;
    }
    if (copy.from !== 'builder') {
      errors.push(`runtime module must be copied from the authoritative builder: ${relative}`);
      continue;
    }

    const destination = resolveImagePath(
      copy.workdir,
      copy.destination,
      copy.source,
      false,
    );
    const expectedDestination = `/app/${relative}`;
    if (destination !== expectedDestination) {
      errors.push(`runtime module must preserve its repository layout: ${relative}`);
      continue;
    }
    const previous = moduleCopies.get(relative);
    if (previous && previous !== destination) {
      errors.push(`runtime module has ambiguous final-image destinations: ${relative}`);
      continue;
    }
    moduleCopies.set(relative, destination);
    moduleCopyRecords.set(relative, {
      copy,
      destination,
    });
    modeledFinalCopies.add(copy);
  }

  for (const copy of copies) {
    if (!modeledFinalCopies.has(copy)) {
      errors.push(`${dockerRelative}: unmodeled final-image COPY`);
    }
  }

  const modeledSourceCopies = new Set(
    [...moduleCopyRecords.values()].map((record) => record.copy),
  );
  for (const copy of copies) {
    const destination = resolveImagePath(
      copy.workdir,
      copy.destination,
      copy.source,
      true,
    );
    const targetsRepositorySourceTree = destination === '/app/src'
      || destination === '/app/scripts'
      || isWithinImageDirectory(destination, '/app/src')
      || isWithinImageDirectory(destination, '/app/scripts');
    if (targetsRepositorySourceTree && !modeledSourceCopies.has(copy)) {
      errors.push(`${dockerRelative}: unmodeled repository-source destination COPY`);
    }
  }

  for (const [relative, moduleCopy] of moduleCopyRecords) {
    for (const copy of copies) {
      if (copy === moduleCopy.copy) continue;
      const destination = resolveImagePath(
        copy.workdir,
        copy.destination,
        copy.source,
        true,
      );
      const isPriorStandaloneTree = copy.from === 'builder'
        && copy.source === '/app/.next/standalone'
        && destination === '/app'
        && copy.order < moduleCopy.copy.order;
      if (!isPriorStandaloneTree
        && imagePathsOverlap(destination, moduleCopy.destination)) {
        errors.push(`runtime module final-image path has a foreign COPY collision: ${relative}`);
        break;
      }
    }
  }

  for (const [packageName, packageCopy] of packageCopies) {
    for (const copy of copies) {
      if (copy === packageCopy.copy) continue;
      const destination = resolveImagePath(
        copy.workdir,
        copy.destination,
        copy.source,
        true,
      );
      const isPriorStandaloneTree = copy.from === 'builder'
        && copy.source === '/app/.next/standalone'
        && destination === '/app'
        && copy.order < packageCopy.copy.order;
      if (!isPriorStandaloneTree
        && imagePathsOverlap(destination, packageCopy.destination)) {
        errors.push(`runtime package final-image tree has a foreign COPY collision: ${packageName}`);
        break;
      }
    }
  }

  const commandTargetDestination = commandTarget && workdir
    ? path.posix.resolve(workdir, commandTarget)
    : undefined;
  if (commandTargetDestination && standaloneRuntimeCopies.length === 1) {
    const [standaloneCopy] = standaloneRuntimeCopies;
    for (const copy of copies) {
      if (copy === standaloneCopy.copy) continue;
      const destination = resolveImagePath(
        copy.workdir,
        copy.destination,
        copy.source,
        true,
      );
      if (imagePathsOverlap(destination, commandTargetDestination)) {
        errors.push('standalone runtime target has a foreign COPY collision');
        break;
      }
    }
  }

  const commandModuleDestination = commandModule && workdir
    ? path.posix.resolve(workdir, commandModule)
    : undefined;
  if (commandModule
    && moduleCopies.get(commandModule) !== commandModuleDestination) {
    errors.push(`final Node runtime module must be explicitly copied: ${commandModule}`);
  }

  const packageSource = await readOptional(path.join(root, 'package.json'));
  let packageJson;
  try {
    packageJson = packageSource === undefined ? undefined : JSON.parse(packageSource);
  } catch {
    return;
  }
  if (!packageJson) return;

  const productionDependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.optionalDependencies ?? {}),
  };
  const resolver = createRequire(path.join(root, 'package.json'));
  const checkedPackageSpecifiers = new Set();
  const visitedPackageRoots = new Set();
  const packageRootsInProgress = new Set();
  const visitedModules = new Set();
  const lexicalNodeModulesRoot = path.join(root, 'node_modules');
  let canonicalNodeModulesRoot;
  try {
    canonicalNodeModulesRoot = await realpath(lexicalNodeModulesRoot);
  } catch {
    errors.push('runtime package dependency tree is unavailable');
    return;
  }

  function finalImagePackageDestination(lexicalPackageRoot) {
    for (const packageCopy of packageCopies.values()) {
      if (!isWithinDirectory(lexicalPackageRoot, packageCopy.sourceRoot)) continue;
      const relative = path.relative(packageCopy.sourceRoot, lexicalPackageRoot);
      const translated = path.posix.join(
        packageCopy.destination,
        ...relative.split(path.sep).filter(Boolean),
      );
      const repositoryRelative = path.relative(root, lexicalPackageRoot);
      const expected = path.posix.join(
        '/app',
        ...repositoryRelative.split(path.sep).filter(Boolean),
      );
      if (translated === expected) return translated;
    }
    return undefined;
  }

  async function installedDependencySlot(importerRoot, dependencyName) {
    const dependencyResolver = createRequire(path.join(importerRoot, 'package.json'));
    const searchRoots = dependencyResolver.resolve.paths(dependencyName) ?? [];
    for (const searchRoot of searchRoots) {
      const candidate = path.join(searchRoot, ...dependencyName.split('/'));
      if (!isWithinDirectory(candidate, lexicalNodeModulesRoot)) continue;
      try {
        const metadata = await lstat(candidate);
        if (metadata.isSymbolicLink()) {
          throw new Error('runtime package dependency slots cannot be symbolic links');
        }
        if (metadata.isDirectory()) return candidate;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return undefined;
  }

  function validDependencyMap(value) {
    return value === undefined
      || (value !== null && typeof value === 'object' && !Array.isArray(value));
  }

  async function validatePackageDependencyClosure(
    packageName,
    lexicalPackageRoot,
    finalImageDestination,
  ) {
    let canonicalPackageRoot;
    try {
      const packageRootStat = await lstat(lexicalPackageRoot);
      if (!packageRootStat.isDirectory() || packageRootStat.isSymbolicLink()) {
        throw new Error('runtime package roots must be real directories');
      }
      canonicalPackageRoot = await realpath(lexicalPackageRoot);
    } catch {
      errors.push(`runtime package metadata is invalid: ${packageName}`);
      return;
    }
    if (!isWithinDirectory(canonicalPackageRoot, canonicalNodeModulesRoot)
      || !finalImageDestination) {
      errors.push(`runtime package metadata is invalid: ${packageName}`);
      return;
    }
    if (visitedPackageRoots.has(lexicalPackageRoot)
      || packageRootsInProgress.has(lexicalPackageRoot)) {
      return;
    }
    if (visitedPackageRoots.size + packageRootsInProgress.size >= 4096) {
      errors.push('runtime package dependency closure exceeds its bounded size');
      return;
    }
    packageRootsInProgress.add(lexicalPackageRoot);

    let manifest;
    try {
      const manifestPath = path.join(lexicalPackageRoot, 'package.json');
      const manifestStat = await stat(manifestPath);
      if (!manifestStat.isFile() || manifestStat.size > 1024 * 1024) {
        throw new Error('invalid package manifest');
      }
      const canonicalManifestPath = await realpath(manifestPath);
      if (!isWithinDirectory(canonicalManifestPath, canonicalPackageRoot)) {
        throw new Error('package manifest escapes its package root');
      }
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch {
      errors.push(`runtime package metadata is invalid: ${packageName}`);
      packageRootsInProgress.delete(lexicalPackageRoot);
      return;
    }
    const dependencies = manifest?.dependencies;
    const optionalDependencies = manifest?.optionalDependencies;
    const peerDependencies = manifest?.peerDependencies;
    const peerDependenciesMeta = manifest?.peerDependenciesMeta;
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
      || !validDependencyMap(dependencies)
      || !validDependencyMap(optionalDependencies)
      || !validDependencyMap(peerDependencies)
      || !validDependencyMap(peerDependenciesMeta)) {
      errors.push(`runtime package metadata is invalid: ${packageName}`);
      packageRootsInProgress.delete(lexicalPackageRoot);
      return;
    }

    const edges = new Map();
    for (const dependencyName of Object.keys(dependencies ?? {})) {
      if (!Object.hasOwn(optionalDependencies ?? {}, dependencyName)) {
        edges.set(dependencyName, true);
      }
    }
    for (const dependencyName of Object.keys(optionalDependencies ?? {})) {
      edges.set(dependencyName, false);
    }
    for (const dependencyName of Object.keys(peerDependencies ?? {})) {
      const metadata = peerDependenciesMeta?.[dependencyName];
      if (metadata !== undefined
        && (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata))) {
        errors.push(`runtime package metadata is invalid: ${packageName}`);
        packageRootsInProgress.delete(lexicalPackageRoot);
        return;
      }
      const requiredPeer = metadata?.optional !== true;
      edges.set(dependencyName, (edges.get(dependencyName) ?? false) || requiredPeer);
    }
    if (edges.size > 2048) {
      errors.push(`runtime package metadata is invalid: ${packageName}`);
      packageRootsInProgress.delete(lexicalPackageRoot);
      return;
    }

    for (const [dependencyName, required] of [...edges].sort(([left], [right]) => (
      left < right ? -1 : left > right ? 1 : 0
    ))) {
      if (isBuiltin(dependencyName)) continue;
      if (packageNameFromSpecifier(dependencyName) !== dependencyName) {
        errors.push(`runtime package metadata is invalid: ${packageName}`);
        continue;
      }
      let dependencyRoot;
      try {
        dependencyRoot = await installedDependencySlot(lexicalPackageRoot, dependencyName);
      } catch {
        errors.push(`runtime package metadata is invalid: ${packageName}`);
        continue;
      }
      if (!dependencyRoot) {
        if (required) {
          errors.push(
            `runtime package dependency is absent from the installed dependency tree: ${packageName} -> ${dependencyName}`,
          );
        }
        continue;
      }
      const dependencyDestination = finalImagePackageDestination(dependencyRoot);
      if (!dependencyDestination) {
        errors.push(
          `runtime package dependency is absent from the final-image dependency tree: ${packageName} -> ${dependencyName}`,
        );
        continue;
      }
      await validatePackageDependencyClosure(
        dependencyName,
        dependencyRoot,
        dependencyDestination,
      );
    }

    packageRootsInProgress.delete(lexicalPackageRoot);
    visitedPackageRoots.add(lexicalPackageRoot);
  }

  async function validatePackageImport(specifier, importer) {
    const packageName = packageNameFromSpecifier(specifier);
    if (!packageName) {
      errors.push(`runtime module uses an unsupported package specifier: ${importer}`);
      return;
    }
    if (!Object.hasOwn(productionDependencies, packageName)) {
      errors.push(`runtime package must be a production dependency: ${packageName}`);
      return;
    }
    if (checkedPackageSpecifiers.has(specifier)) return;
    checkedPackageSpecifiers.add(specifier);

    let resolved;
    try {
      resolved = resolver.resolve(specifier);
    } catch {
      errors.push(`runtime package must resolve from the installed dependency tree: ${packageName}`);
      return;
    }
    const installedRoot = path.join(root, 'node_modules', ...packageName.split('/'));
    let canonicalResolved;
    let canonicalInstalledRoot;
    try {
      [canonicalResolved, canonicalInstalledRoot] = await Promise.all([
        realpath(resolved),
        realpath(installedRoot),
      ]);
    } catch {
      errors.push(`runtime package must resolve from the installed dependency tree: ${packageName}`);
      return;
    }
    if (!isWithinDirectory(canonicalResolved, canonicalInstalledRoot)) {
      errors.push(`runtime package resolved outside its installed package root: ${packageName}`);
      return;
    }

    const expectedDestination = `/app/node_modules/${packageName}`;
    if (packageCopies.get(packageName)?.destination !== expectedDestination) {
      errors.push(`runtime package is absent from the final-image dependency tree: ${packageName}`);
      return;
    }
    await validatePackageDependencyClosure(
      packageName,
      path.join(root, 'node_modules', ...packageName.split('/')),
      expectedDestination,
    );
  }

  async function visitModule(relative) {
    if (visitedModules.has(relative)) return;
    visitedModules.add(relative);
    const source = await readOptional(path.join(root, ...relative.split('/')));
    if (source === undefined) {
      errors.push(`runtime module dependency is absent from the repository: ${relative}`);
      return;
    }

    const importerDestination = moduleCopies.get(relative);
    const analysis = analyzeRuntimeModule(relative, source, errors);
    if (analysis.nonLiteralRequires > 0) {
      errors.push(`runtime module contains a non-literal require: ${relative}`);
    }
    if (analysis.unsupportedRuntimeLoaders > 0) {
      errors.push(`runtime module contains an unsupported loader: ${relative}`);
    }
    if (analysis.unsupportedRuntimeDataAccesses > 0) {
      errors.push(`runtime module contains unmodeled runtime data access: ${relative}`);
    }
    if (analysis.nonLiteralDynamicImports.length > 0) {
      const commandTargetIndex = analysis.nonLiteralDynamicImports.length === 1
        ? commandTargetArgumentIndex(
          analysis.sourceFile,
          analysis.nonLiteralDynamicImports[0],
        )
        : undefined;
      const standaloneRuntimeRoot = standaloneRuntimeRoots.length === 1
        ? standaloneRuntimeRoots[0]
        : undefined;
      const expectedStandaloneTarget = standaloneRuntimeRoot
        ? path.posix.join(standaloneRuntimeRoot, 'server.js')
        : undefined;
      const isSupportedCommandTarget = relative === commandModule
        && commandTargetIndex === 2
        && typeof commandTargetDestination === 'string'
        && commandTargetDestination === expectedStandaloneTarget;
      if (!isSupportedCommandTarget) {
        errors.push(`runtime module contains an unresolved dynamic import: ${relative}`);
      }
    }

    for (const specifier of analysis.specifiers) {
      if (isBuiltin(specifier)) continue;
      if (!specifier.startsWith('.')) {
        if (specifier.startsWith('/') || specifier.startsWith('file:')) {
          errors.push(`runtime module uses an unsupported absolute import: ${relative}`);
        } else {
          await validatePackageImport(specifier, relative);
        }
        continue;
      }

      const dependency = path.posix.normalize(
        path.posix.join(path.posix.dirname(relative), specifier),
      );
      if (dependency === '..' || dependency.startsWith('../') || path.posix.isAbsolute(dependency)) {
        errors.push(`runtime module import escapes the repository: ${relative}`);
        continue;
      }

      const expectedDestination = path.posix.normalize(
        path.posix.join(path.posix.dirname(importerDestination), specifier),
      );
      if (moduleCopies.get(dependency) !== expectedDestination) {
        errors.push(`runtime module dependency is absent from the final image: ${dependency}`);
        continue;
      }
      await visitModule(dependency);
    }
  }

  if (commandModule && moduleCopies.has(commandModule)) {
    await visitModule(commandModule);
  }
  for (const relative of [...moduleCopies.keys()].sort()) {
    if (!visitedModules.has(relative)) {
      errors.push(`unreferenced manually copied runtime module: ${relative}`);
    }
  }
  for (const [packageName, packageCopy] of [...packageCopies].sort(([left], [right]) => (
    left < right ? -1 : left > right ? 1 : 0
  ))) {
    if (!visitedPackageRoots.has(packageCopy.sourceRoot)) {
      errors.push(`unreferenced runtime package copy: ${packageName}`);
    }
  }
}

async function validateRuntimeCredentialContract(root, errors) {
  const activeNames = [
    'ADMIN_JWT_SECRET',
    'GUEST_JWT_SECRET',
    'ADMIN_DASH_SECRET',
  ];
  const obsoleteNames = [
    'JWT_SECRET',
    'SESSION_SECRET',
    'SECURITY_ENC_KEY_HEX',
    'SECURITY_ENC_KEY_HEX_PREVIOUS',
  ];
  const credentialSource = await readOptional(
    path.join(root, 'src/lib/runtime-credentials.js'),
  );
  const runtimeSchema = await readOptional(
    path.join(root, 'src/lib/runtime-env-schema.js'),
  );
  const standalone = await readOptional(path.join(root, 'scripts/start-standalone.mjs'));
  const standaloneTest = await readOptional(
    path.join(root, 'scripts/test-runtime-credential-contract.mjs'),
  );

  for (const marker of [
    'ACTIVE_RUNTIME_CREDENTIAL_NAMES',
    'MINIMUM_ESTIMATED_ENTROPY_BITS',
    'MINIMUM_DISTINCT_CHARACTERS',
    'PLACEHOLDER_TERMS',
    'isPlaceholderLike',
    'hasRepeatedPattern',
    'runtimeCredentialIssue',
    'readRuntimeCredential',
  ]) {
    if (!credentialSource?.includes(marker)) {
      errors.push(`runtime credential validator lacks: ${marker}`);
    }
  }
  for (const name of activeNames) {
    if (!credentialSource?.includes(`'${name}'`)) {
      errors.push(`runtime credential validator must include ${name}`);
    }
  }
  for (const marker of [
    'ACTIVE_RUNTIME_CREDENTIAL_NAMES',
    'runtimeCredentialIssue',
    'credentialOwners',
    'must differ from',
  ]) {
    if (!runtimeSchema?.includes(marker)) {
      errors.push(`runtime environment schema lacks credential control: ${marker}`);
    }
  }
  if (!standalone?.includes('runtimeEnvSchema.parse(process.env)')) {
    errors.push('standalone startup must validate the authoritative runtime environment schema');
  }
  for (const marker of [
    'SYNTHETIC_PRODUCTION_ENVIRONMENT',
    "['missing'",
    "['invalid'",
    "['identical'",
    "['valid'",
    'output must not expose credentials',
  ]) {
    if (!standaloneTest?.includes(marker)) {
      errors.push(`standalone credential contract test lacks: ${marker}`);
    }
  }

  const activeConfigurationFiles = [
    '.env.example',
    'src/lib/runtime-env-schema.js',
    'scripts/ensure-pepper.js',
    'scripts/system-orchestrator.sh',
    'scripts/install-systemd-services.sh',
    'scripts/README.md',
    'SECURITY.md',
  ];
  for (const relative of activeConfigurationFiles) {
    const source = await readOptional(path.join(root, relative));
    if (source === undefined) {
      errors.push(`runtime credential configuration surface is required: ${relative}`);
      continue;
    }
    const configuredNames = new Set(source.split(/[^A-Z0-9_]+/u));
    for (const obsolete of obsoleteNames) {
      if (configuredNames.has(obsolete)) {
        errors.push(`${relative}: obsolete runtime credential ${obsolete} is forbidden`);
      }
    }
  }

  const adminAuth = await readOptional(path.join(root, 'src/lib/auth/admin.ts'));
  const guestAuth = await readOptional(path.join(root, 'src/lib/guestSession.ts'));
  const adminLogin = await readOptional(path.join(root, 'src/app/api/admin/login/route.ts'));
  const devAlertVerification = await readOptional(
    path.join(root, 'src/app/api/dev/alerts/verify-spike/route.ts'),
  );
  if (!adminAuth?.includes("readRuntimeCredential('ADMIN_JWT_SECRET')")) {
    errors.push('admin JWT signing must use the centralized runtime credential reader');
  }
  if (!guestAuth?.includes("readRuntimeCredential('GUEST_JWT_SECRET')")) {
    errors.push('guest JWT signing must use the centralized runtime credential reader');
  }
  if (!adminLogin?.includes("readRuntimeCredential('ADMIN_DASH_SECRET')")) {
    errors.push('admin login must use the centralized runtime credential reader');
  }
  if (!devAlertVerification?.includes("readRuntimeCredential('ADMIN_DASH_SECRET')")) {
    errors.push('development alert verification must use the centralized runtime credential reader');
  }
  if (guestAuth?.includes('dev-guest-secret-change-me')) {
    errors.push('fixed development guest signing credentials are forbidden');
  }
  if ([adminAuth, guestAuth, adminLogin, devAlertVerification].some((source) => (
    source && /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|KEY)/u.test(source)
  ))) {
    errors.push('server credentials must not be exposed through NEXT_PUBLIC variables');
  }
  if (!await exists(path.join(root, 'docs/security/runtime-credential-contract.md'))) {
    errors.push('runtime credential contract documentation is required');
  }
}

export async function validateReleasePolicy(
  repositoryRoot = process.cwd(),
  { gates = RELEASE_GATES } = {},
) {
  const root = path.resolve(repositoryRoot);
  const errors = [];

  validateGateProfile(gates, errors);
  validateControlledEnvironments(errors);

  const packageSource = await readOptional(path.join(root, 'package.json'));
  if (packageSource === undefined) {
    errors.push('package.json is required');
  } else {
    try {
      validatePackage(JSON.parse(packageSource), errors);
    } catch {
      errors.push('package.json must contain valid JSON');
    }
  }

  const workflowFiles = await filesBelow(path.join(root, '.github/workflows'), root);
  if (workflowFiles.length > 0) {
    errors.push(`active GitHub Actions workflows are forbidden: ${workflowFiles.join(', ')}`);
  }
  const githubFiles = await filesBelow(path.join(root, '.github'), root);
  for (const relative of githubFiles) {
    const source = await readFile(path.join(root, relative), 'utf8');
    if (/\bpull_request_target\b/u.test(source)) {
      errors.push(`${relative}: pull_request_target is forbidden`);
    }
  }

  for (const relative of FORBIDDEN_PLATFORM_PATHS) {
    if (await exists(path.join(root, relative))) {
      errors.push(`retired deployment artifact ${relative} is forbidden`);
    }
  }

  await validateLocalDefaults(root, errors);
  await validateActiveScripts(root, errors);
  await validatePostgresReferences(root, errors);
  await validateTrustedIngress(root, errors);
  await validateLayeredRateLimiting(root, errors);
  await validateSecretScanning(root, errors);
  await validateClaimTokenTransport(root, errors);
  await validateRuntimeCredentialContract(root, errors);
  await validateSecurityImageRuntimeClosure(root, errors);
  await validateVerifyImplementation(root, errors);

  return [...new Set(errors)].sort();
}

export const releasePolicyInternals = Object.freeze({
  expectedPostgresImage: EXPECTED_POSTGRES_IMAGE,
  expectedGateProfile: EXPECTED_GATE_PROFILE,
  expectedPackageScripts: EXPECTED_PACKAGE_SCRIPTS,
  expectedSecretToolLock: EXPECTED_SECRET_TOOL_LOCK,
  expectedHistoricalSecretBaseline: EXPECTED_HISTORICAL_SECRET_BASELINE,
  expectedCurrentSecretFixtures: EXPECTED_CURRENT_SECRET_FIXTURES,
});
