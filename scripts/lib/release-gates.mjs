export const APPROVED_POSTGRES_IMAGE =
  'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';

export const HOSTILE_INTEGRATION_ENVIRONMENT = Object.freeze({
  INTEGRATION_POSTGRES_IMAGE: APPROVED_POSTGRES_IMAGE,
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

export const SYNTHETIC_PRODUCTION_ENVIRONMENT = Object.freeze({
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
  TRUST_PROXY_MODE: 'hops',
  TRUST_PROXY_HOPS: '1',
  RATE_LIMIT_BACKEND: 'redis',
  UPSTASH_REDIS_REST_URL: 'https://redis.release.invalid',
  UPSTASH_REDIS_REST_TOKEN: 'release-only-redis-token-000000',
});

function npmGate(id, label, script, extraArgs = [], environment = 'base') {
  return Object.freeze({
    id,
    label,
    command: 'npm',
    args: Object.freeze(['--ignore-scripts', 'run', script, ...extraArgs]),
    environment,
  });
}

export const RELEASE_GATES = Object.freeze([
  npmGate('release-policy', 'Local release-policy validation', 'validate:release-policy'),
  npmGate('release-policy-tests', 'Local release-policy tests', 'test:release-policy'),
  npmGate('conflicts', 'Conflict-marker check', 'check:conflicts'),
  npmGate('prisma-manifest', 'Prisma integrity manifest check', 'check:prisma-integrity'),
  npmGate('prisma-tests', 'Prisma integrity policy tests', 'test:prisma-integrity'),
  npmGate('postgres-policy-tests', 'PostgreSQL image-policy tests', 'test:postgres-image-policy'),
  npmGate('default-tests', 'Default test suite', 'test'),
  npmGate('unit-tests', 'Unit test suite', 'test:unit'),
  npmGate('security-tests', 'Security test suite', 'test:security'),
  npmGate('coverage', 'Coverage thresholds', 'test:coverage'),
  npmGate('typecheck', 'TypeScript typecheck', 'typecheck'),
  npmGate('lint', 'Primary lint with zero warnings', 'lint', ['--', '--max-warnings=0']),
  npmGate('security-lint', 'Security lint', 'lint:security'),
  npmGate('dead-code', 'Dead-code check', 'check:dead-code'),
  npmGate('licenses', 'Dependency license check', 'security:license-check'),
  npmGate('prisma-validate', 'Prisma schema validation', 'prisma:validate'),
  npmGate('postgres-policy', 'PostgreSQL image provenance check', 'check:postgres-image-policy'),
  npmGate(
    'integration',
    'Disposable PostgreSQL integration suite',
    'test:integration',
    [],
    'integration',
  ),
  npmGate(
    'production-build',
    'Synthetic production/security build',
    'validate:security',
    [],
    'production',
  ),
  npmGate('final-prisma-manifest', 'Final Prisma integrity verification', 'check:prisma-integrity'),
  npmGate('final-prisma-hashes', 'Final deterministic Prisma hashes', 'hash:prisma-integrity'),
  Object.freeze({
    id: 'diff-check',
    label: 'Git whitespace/error check',
    command: 'git',
    args: Object.freeze(['diff', '--check']),
    environment: 'base',
  }),
  npmGate('candidate-diff', 'Complete candidate diff check', 'check:candidate-diff'),
  npmGate('integration-orphans', 'Disposable-container orphan check', 'check:integration-orphans'),
]);
