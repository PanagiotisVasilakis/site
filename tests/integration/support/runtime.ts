import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { APPROVED_POSTGRES_IMAGE } from './postgres-image-policy';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const POSTGRES_IMAGE = APPROVED_POSTGRES_IMAGE;
export const POSTGRES_INTERNAL_PORT = 5432;
export const DATABASE_PREFIX = 'site_integration_test';
export const CONTAINER_PREFIX = 'site-integration-test';
const OPT_IN_ENV = 'SITE_DISPOSABLE_TEST_DB_OPT_IN';
export const OPT_IN_VALUE = 'ALLOW_ONLY_THIS_GENERATED_DISPOSABLE_POSTGRES_RUN';

const CONTEXT_ENV = {
  runId: 'SITE_TEST_RUN_ID',
  runFingerprint: 'SITE_TEST_RUN_FINGERPRINT',
  repositoryId: 'SITE_TEST_REPOSITORY_ID',
  containerId: 'SITE_TEST_CONTAINER_ID',
  containerName: 'SITE_TEST_CONTAINER_NAME',
  containerImageId: 'SITE_TEST_CONTAINER_IMAGE_ID',
  port: 'SITE_TEST_POSTGRES_PORT',
  user: 'SITE_TEST_POSTGRES_USER',
  password: 'SITE_TEST_POSTGRES_PASSWORD',
  controlDatabase: 'SITE_TEST_CONTROL_DATABASE',
  forbiddenTargets: 'SITE_TEST_FORBIDDEN_DB_TARGETS',
} as const;

export const DOCKER_LABELS = {
  disposable: 'com.qr-city-guide.integration.disposable',
  runId: 'com.qr-city-guide.integration.run-id',
  repositoryId: 'com.qr-city-guide.integration.repository-id',
  fingerprint: 'com.qr-city-guide.integration.fingerprint',
} as const;

const SAFE_CHILD_ENVIRONMENT_KEYS = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'CI',
  'NO_COLOR',
  'FORCE_COLOR',
  'SYSTEMROOT',
  'ComSpec',
  'PATHEXT',
  'XDG_CACHE_HOME',
] as const;

const RUN_ID_PATTERN = /^[a-f0-9]{12}$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{48}$/;
const REPOSITORY_ID_PATTERN = /^[a-f0-9]{16}$/;

export interface DisposablePostgresRuntime {
  runId: string;
  runFingerprint: string;
  repositoryId: string;
  containerId: string;
  containerName: string;
  containerImageId: string;
  port: number;
  user: string;
  password: string;
  controlDatabase: string;
  forbiddenTargetFingerprints: ReadonlySet<string>;
  optIn: string;
}

function requiredEnvironmentValue(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Disposable PostgreSQL runner context is missing ${name}.`);
  }
  return value;
}

export function repositoryIdentifier(repositoryRoot: string): string {
  return createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 16);
}

export function databaseFingerprint(runFingerprint: string, database: string): string {
  return `qr-city-guide-integration:${createHash('sha256')
    .update(`${runFingerprint}:${database}`)
    .digest('hex')}`;
}

export function readDisposablePostgresRuntime(
  env: NodeJS.ProcessEnv = process.env,
): DisposablePostgresRuntime {
  const runId = requiredEnvironmentValue(CONTEXT_ENV.runId, env);
  const runFingerprint = requiredEnvironmentValue(CONTEXT_ENV.runFingerprint, env);
  const repositoryId = requiredEnvironmentValue(CONTEXT_ENV.repositoryId, env);
  const port = Number.parseInt(requiredEnvironmentValue(CONTEXT_ENV.port, env), 10);
  const user = requiredEnvironmentValue(CONTEXT_ENV.user, env);
  const controlDatabase = requiredEnvironmentValue(CONTEXT_ENV.controlDatabase, env);

  if (!RUN_ID_PATTERN.test(runId) || !FINGERPRINT_PATTERN.test(runFingerprint)) {
    throw new Error('Disposable PostgreSQL runner identity is malformed.');
  }
  if (!REPOSITORY_ID_PATTERN.test(repositoryId)) {
    throw new Error('Disposable PostgreSQL repository identity is malformed.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Disposable PostgreSQL mapped port is malformed.');
  }
  if (user !== `${DATABASE_PREFIX}_${runId}`) {
    throw new Error('Disposable PostgreSQL user does not match the current run.');
  }
  if (controlDatabase !== `${DATABASE_PREFIX}_${runId}_control`) {
    throw new Error('Disposable PostgreSQL control database does not match the current run.');
  }

  return {
    runId,
    runFingerprint,
    repositoryId,
    containerId: requiredEnvironmentValue(CONTEXT_ENV.containerId, env),
    containerName: requiredEnvironmentValue(CONTEXT_ENV.containerName, env),
    containerImageId: requiredEnvironmentValue(CONTEXT_ENV.containerImageId, env),
    port,
    user,
    password: requiredEnvironmentValue(CONTEXT_ENV.password, env),
    controlDatabase,
    forbiddenTargetFingerprints: new Set(
      (env[CONTEXT_ENV.forbiddenTargets] ?? '').split(',').filter(Boolean),
    ),
    optIn: env[OPT_IN_ENV] ?? '',
  };
}

export function runtimeEnvironment(runtime: DisposablePostgresRuntime): Record<string, string> {
  return {
    [OPT_IN_ENV]: runtime.optIn,
    [CONTEXT_ENV.runId]: runtime.runId,
    [CONTEXT_ENV.runFingerprint]: runtime.runFingerprint,
    [CONTEXT_ENV.repositoryId]: runtime.repositoryId,
    [CONTEXT_ENV.containerId]: runtime.containerId,
    [CONTEXT_ENV.containerName]: runtime.containerName,
    [CONTEXT_ENV.containerImageId]: runtime.containerImageId,
    [CONTEXT_ENV.port]: String(runtime.port),
    [CONTEXT_ENV.user]: runtime.user,
    [CONTEXT_ENV.password]: runtime.password,
    [CONTEXT_ENV.controlDatabase]: runtime.controlDatabase,
    [CONTEXT_ENV.forbiddenTargets]: [...runtime.forbiddenTargetFingerprints].join(','),
  };
}

export function safeChildEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', TZ: 'UTC' };
  for (const name of SAFE_CHILD_ENVIRONMENT_KEYS) {
    const value = source[name];
    if (value) env[name] = value;
  }
  return env;
}
