import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import dotenv from 'dotenv';

import {
  assertDisposableContainer,
  assertStartedDisposableContainer,
  canonicalDatabaseTargetFingerprint,
  databaseTarget,
  sanitizeDatabaseDiagnostics,
  withVerifiedDisposableDatabase,
} from './database-safety';
import type {
  DisposableContainerIdentity,
  DisposableDatabaseTarget,
} from './database-safety';
import {
  CONTAINER_PREFIX,
  DATABASE_PREFIX,
  DOCKER_LABELS,
  OPT_IN_VALUE,
  POSTGRES_IMAGE,
  REPOSITORY_ROOT,
  databaseFingerprint,
  repositoryIdentifier,
  runtimeEnvironment,
  safeChildEnvironment,
} from './runtime';
import type { DisposablePostgresRuntime } from './runtime';

const execFileAsync = promisify(execFile);
const DATABASE_URL_ENVIRONMENT_NAME = /(database.*url|direct_url|(?:^|_)db_url(?:_|$))/i;
const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.staging',
  '.env.staging.local',
  '.env.production',
  '.env.production.local',
] as const;

let allocationSequence = 0;

function dockerClientEnvironment(extra: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  const env = safeChildEnvironment();
  for (const name of ['DOCKER_CONTEXT', 'DOCKER_HOST', 'DOCKER_CONFIG'] as const) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  return { ...env, ...extra };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function docker(
  args: readonly string[],
  secrets: readonly string[] = [],
  environment: NodeJS.ProcessEnv = dockerClientEnvironment(),
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('docker', [...args], {
      cwd: REPOSITORY_ROOT,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
      killSignal: 'SIGKILL',
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Disposable PostgreSQL Docker command failed: ${
      sanitizeDatabaseDiagnostics(error, secrets)
    }`);
  }
}

async function assertLocalDockerDaemon(): Promise<void> {
  const endpointJson = await docker([
    'context',
    'inspect',
    '--format',
    '{{json .Endpoints.docker.Host}}',
  ]);
  let endpoint: string;
  try {
    endpoint = JSON.parse(endpointJson) as string;
  } catch {
    throw new Error('Docker returned an invalid daemon endpoint.');
  }
  if (typeof endpoint !== 'string') {
    throw new Error('Docker returned an invalid daemon endpoint.');
  }
  if (!endpoint.startsWith('unix://') && !endpoint.startsWith('npipe://')) {
    throw new Error('Disposable PostgreSQL requires a local Docker socket, not a remote daemon.');
  }
}

async function readDockerInspect(containerId: string): Promise<Record<string, unknown>> {
  const output = await docker(['inspect', containerId]);
  const records = JSON.parse(output) as Array<Record<string, unknown>>;
  if (records.length !== 1) {
    throw new Error('Docker returned an ambiguous disposable container identity.');
  }
  return records[0];
}

function mappedPostgresPort(record: Record<string, unknown>): number | undefined {
  const networkSettings = record.NetworkSettings as {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  } | undefined;
  const binding = networkSettings?.Ports?.['5432/tcp'];
  if (!Array.isArray(binding) || binding.length !== 1 || binding[0].HostIp !== '127.0.0.1') {
    return undefined;
  }
  const port = Number.parseInt(binding[0].HostPort ?? '', 10);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : undefined;
}

async function waitForMappedPort(containerId: string): Promise<number> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const port = mappedPostgresPort(await readDockerInspect(containerId));
    if (port) return port;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Docker did not publish the disposable PostgreSQL loopback port.');
}

async function waitForHealthyContainer(runtime: DisposablePostgresRuntime): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const record = await readDockerInspect(runtime.containerId);
    const state = record.State as {
      Running?: boolean;
      Status?: string;
      Health?: { Status?: string };
    } | undefined;
    if (state?.Running && state.Health?.Status === 'healthy') return;
    if (state?.Status === 'exited' || state?.Status === 'dead') {
      throw new Error('Disposable PostgreSQL exited before becoming healthy.');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Disposable PostgreSQL did not become healthy before the bounded deadline.');
}

async function collectKnownDatabaseTargetFingerprints(): Promise<Set<string>> {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(process.env)) {
    if (value && DATABASE_URL_ENVIRONMENT_NAME.test(name)) values.add(value);
  }
  for (const relativeFile of ENV_FILES) {
    try {
      const parsed = dotenv.parse(await readFile(path.join(REPOSITORY_ROOT, relativeFile)));
      for (const [name, value] of Object.entries(parsed)) {
        if (value && DATABASE_URL_ENVIRONMENT_NAME.test(name)) values.add(value);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  const fingerprints = new Set<string>();
  for (const value of values) {
    try {
      const url = new URL(value);
      if (url.protocol === 'postgresql:' || url.protocol === 'postgres:') {
        fingerprints.add(canonicalDatabaseTargetFingerprint(value));
      }
    } catch {
      // Invalid inherited values can never equal a canonical generated target.
    }
  }
  return fingerprints;
}

export async function startDisposablePostgres(): Promise<DisposablePostgresRuntime> {
  const runId = randomBytes(6).toString('hex');
  const runFingerprint = randomBytes(24).toString('hex');
  const repositoryId = repositoryIdentifier(REPOSITORY_ROOT);
  const user = `${DATABASE_PREFIX}_${runId}`;
  const password = randomBytes(32).toString('base64url');
  const controlDatabase = `${DATABASE_PREFIX}_${runId}_control`;
  const containerName = `${CONTAINER_PREFIX}-${runId}`;
  const forbiddenTargetFingerprints = await collectKnownDatabaseTargetFingerprints();
  await assertLocalDockerDaemon();
  const containerImageId = await docker(['image', 'inspect', POSTGRES_IMAGE, '--format', '{{.Id}}']);

  const dockerEnvironment = dockerClientEnvironment({
    POSTGRES_USER: user,
    POSTGRES_PASSWORD: password,
    POSTGRES_DB: controlDatabase,
  });
  const containerId = await docker([
    'run',
    '--detach',
    '--rm',
    '--name', containerName,
    '--label', `${DOCKER_LABELS.disposable}=true`,
    '--label', `${DOCKER_LABELS.runId}=${runId}`,
    '--label', `${DOCKER_LABELS.repositoryId}=${repositoryId}`,
    '--label', `${DOCKER_LABELS.fingerprint}=${runFingerprint}`,
    '--publish', '127.0.0.1::5432',
    '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=536870912',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=67108864',
    '--tmpfs', '/run/postgresql:rw,noexec,nosuid,size=16777216',
    '--security-opt', 'no-new-privileges',
    '--health-cmd', 'pg_isready --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"',
    '--health-interval', '1s',
    '--health-timeout', '3s',
    '--health-retries', '60',
    '--env', 'POSTGRES_USER',
    '--env', 'POSTGRES_PASSWORD',
    '--env', 'POSTGRES_DB',
    POSTGRES_IMAGE,
  ], [password, user], dockerEnvironment);
  const identity: DisposableContainerIdentity = {
    runId,
    runFingerprint,
    repositoryId,
    containerId,
    containerName,
    containerImageId,
  };

  let runtime: DisposablePostgresRuntime | undefined;
  try {
    const port = await waitForMappedPort(containerId);
    runtime = {
      ...identity,
      port,
      user,
      password,
      controlDatabase,
      forbiddenTargetFingerprints,
      optIn: OPT_IN_VALUE,
    };
    await waitForHealthyContainer(runtime);
    await assertDisposableContainer(runtime);
    const controlTarget = databaseTarget(runtime, controlDatabase);
    await withVerifiedDisposableDatabase(
      controlTarget,
      'bootstrap-fingerprint',
      async (client) => {
        await client.query(
          `COMMENT ON DATABASE ${quoteIdentifier(controlDatabase)} IS ${
            quoteLiteral(databaseFingerprint(runFingerprint, controlDatabase))
          }`,
        );
      },
      { allowUnmarked: true },
    );
    await withVerifiedDisposableDatabase(controlTarget, 'verification', async () => undefined);
    return runtime;
  } catch (error) {
    const sanitizedSetupError = new Error(sanitizeDatabaseDiagnostics(error, [password, user]));
    let cleanupError: unknown;
    try {
      if (runtime) {
        await removeDisposablePostgresContainer(runtime);
      } else {
        await assertStartedDisposableContainer(identity);
        await docker(['rm', '--force', identity.containerId]);
      }
    } catch (caughtCleanupError) {
      cleanupError = caughtCleanupError;
    }
    if (cleanupError) {
      throw new AggregateError(
        [sanitizedSetupError, new Error(sanitizeDatabaseDiagnostics(cleanupError, [password, user]))],
        'Disposable PostgreSQL setup failed and exact-container cleanup also failed closed.',
      );
    }
    throw sanitizedSetupError;
  }
}

function databaseSuffix(label: string): string {
  const worker = (process.env.VITEST_POOL_ID ?? '0').replace(/[^a-z0-9]/gi, '').toLowerCase() || '0';
  const safeLabel = label.replace(/[^a-z0-9]/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'suite';
  allocationSequence += 1;
  const sequence = allocationSequence.toString(36);
  const fixed = `w${worker}_${sequence}_`;
  return `${fixed}${safeLabel.slice(0, 28 - fixed.length)}`.replace(/_+$/g, '');
}

export async function createIsolatedDatabase(
  runtime: DisposablePostgresRuntime,
  label: string,
): Promise<DisposableDatabaseTarget> {
  const database = `${DATABASE_PREFIX}_${runtime.runId}_${databaseSuffix(label)}`;
  const controlTarget = databaseTarget(runtime, runtime.controlDatabase);
  await withVerifiedDisposableDatabase(controlTarget, 'create-database', async (client) => {
    await client.query(
      `CREATE DATABASE ${quoteIdentifier(database)} OWNER ${quoteIdentifier(runtime.user)} TEMPLATE template0`,
    );
  });

  const target = databaseTarget(runtime, database);
  await withVerifiedDisposableDatabase(
    target,
    'bootstrap-fingerprint',
    async (client) => {
      await client.query(
        `COMMENT ON DATABASE ${quoteIdentifier(database)} IS ${quoteLiteral(target.fingerprint)}`,
      );
    },
    { allowUnmarked: true },
  );
  await withVerifiedDisposableDatabase(target, 'verification', async () => undefined);
  return target;
}

export async function dropIsolatedDatabase(
  target: DisposableDatabaseTarget,
): Promise<void> {
  await withVerifiedDisposableDatabase(target, 'cleanup', async () => undefined);
  const controlTarget = databaseTarget(target.runtime, target.runtime.controlDatabase);
  await withVerifiedDisposableDatabase(controlTarget, 'drop-database', async (client) => {
    await client.query(`DROP DATABASE ${quoteIdentifier(target.database)} WITH (FORCE)`);
  });
}

async function removeDisposablePostgresContainer(runtime: DisposablePostgresRuntime): Promise<void> {
  await assertDisposableContainer(runtime, { allowUnhealthy: true });
  await docker(['rm', '--force', runtime.containerId]);
}

export async function stopDisposablePostgres(runtime: DisposablePostgresRuntime): Promise<void> {
  const controlTarget = databaseTarget(runtime, runtime.controlDatabase);
  try {
    await withVerifiedDisposableDatabase(controlTarget, 'teardown', async () => undefined);
  } catch (databaseError) {
    let containerRemovalError: unknown;
    try {
      await removeDisposablePostgresContainer(runtime);
    } catch (error) {
      containerRemovalError = error;
    }
    throw new AggregateError(
      containerRemovalError ? [databaseError, containerRemovalError] : [databaseError],
      containerRemovalError
        ? 'Database teardown verification and exact-container removal both failed closed.'
        : 'Database teardown verification failed; the exact disposable container was removed.',
    );
  }
  await removeDisposablePostgresContainer(runtime);
}

export function disposableRuntimeChildEnvironment(
  runtime: DisposablePostgresRuntime,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...safeChildEnvironment(),
    ...runtimeEnvironment(runtime),
  };
  for (const name of ['DOCKER_CONTEXT', 'DOCKER_HOST', 'DOCKER_CONFIG'] as const) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  return env;
}
