import { readdir, readFile, stat } from 'node:fs/promises';
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

const EXPECTED_SYNTHETIC_PRODUCTION_ENVIRONMENT = Object.freeze({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://release:synthetic@127.0.0.1:1/release_build',
  DIRECT_URL: 'postgresql://release:synthetic@127.0.0.1:1/release_build',
  ADMIN_JWT_SECRET: 'release-only-admin-jwt-secret-00000000',
  ADMIN_DASH_SECRET: 'release-only-admin-dashboard-secret',
  GUEST_JWT_SECRET: 'release-only-guest-jwt-secret-00000000',
  SECURITY_ENC_KEY_HEX:
    '0000000000000000000000000000000000000000000000000000000000000000',
  SECURITY_PEPPER: 'release-only-security-pepper',
  CLAIM_TOKEN_PEPPER: 'release-only-claim-token-pepper-0000',
  SESSION_SECRET: 'release-only-session-secret-0000000000',
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

const EXPECTED_GATE_PROFILE = Object.freeze([
  ['release-policy', 'npm', ['--ignore-scripts', 'run', 'validate:release-policy'], 'base'],
  ['release-policy-tests', 'npm', ['--ignore-scripts', 'run', 'test:release-policy'], 'base'],
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
  await validateVerifyImplementation(root, errors);

  return [...new Set(errors)].sort();
}

export const releasePolicyInternals = Object.freeze({
  expectedPostgresImage: EXPECTED_POSTGRES_IMAGE,
  expectedGateProfile: EXPECTED_GATE_PROFILE,
  expectedPackageScripts: EXPECTED_PACKAGE_SCRIPTS,
});
