import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import type { Client as PgClient } from 'pg';

import { assertApprovedPostgresImageReference } from './postgres-image-policy';
import {
  DATABASE_PREFIX,
  DOCKER_LABELS,
  OPT_IN_VALUE,
  POSTGRES_IMAGE,
  POSTGRES_INTERNAL_PORT,
  databaseFingerprint,
} from './runtime';
import type { DisposablePostgresRuntime } from './runtime';

const execFileAsync = promisify(execFile);
const { Client } = pg;

const FORBIDDEN_ENVIRONMENT_LABEL = /(production|prod|staging|stage|development|dev)/i;
const DATABASE_NAME_PATTERN = /^site_integration_test_[a-f0-9]{12}_[a-z0-9_]{1,28}$/;
const CONTAINER_ID_PATTERN = /^[a-f0-9]{64}$/;
const IMAGE_ID_PATTERN = /^sha256:[a-f0-9]{64}$/;

export type GuardedDatabaseOperation =
  | 'bootstrap-fingerprint'
  | 'create-database'
  | 'migration'
  | 'seed'
  | 'cleanup'
  | 'drop-database'
  | 'failure-fixture'
  | 'verification'
  | 'teardown';

export interface DisposableDatabaseTarget {
  runtime: DisposablePostgresRuntime;
  database: string;
  databaseUrl: string;
  fingerprint: string;
}

interface DockerInspectRecord {
  Id?: string;
  Image?: string;
  Name?: string;
  Config?: {
    Image?: string;
    Labels?: Record<string, string>;
  };
  State?: {
    Running?: boolean;
    Health?: { Status?: string };
  };
  HostConfig?: {
    Tmpfs?: Record<string, string>;
    Binds?: string[] | null;
    AutoRemove?: boolean;
    RestartPolicy?: { Name?: string };
  };
  Mounts?: Array<{ Destination?: string; Type?: string }>;
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  };
}

interface DatabaseFingerprintRow {
  database_name: string;
  database_user: string;
  server_address: string | null;
  server_port: number;
  server_version_num: string;
  database_owner: string;
  database_comment: string | null;
}

export interface SafetyDependencies {
  inspectContainer?: (runtime: DisposablePostgresRuntime) => Promise<DockerInspectRecord>;
  connect?: (target: DisposableDatabaseTarget) => Promise<PgClient>;
}

export type DisposableContainerIdentity = Pick<DisposablePostgresRuntime,
  | 'runId'
  | 'runFingerprint'
  | 'repositoryId'
  | 'containerId'
  | 'containerName'
  | 'containerImageId'
>;

export class DatabaseSafetyError extends Error {
  constructor(reason: string) {
    super(`Disposable database safety guard rejected the operation: ${reason}.`);
    this.name = 'DatabaseSafetyError';
  }
}

function reject(reason: string): never {
  throw new DatabaseSafetyError(reason);
}

function parseDatabaseUrl(databaseUrl: string): URL {
  try {
    return new URL(databaseUrl);
  } catch {
    return reject('the database URL is malformed');
  }
}

function decodedDatabaseName(url: URL): string {
  try {
    return decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    return reject('the database name is malformed');
  }
}

export function canonicalDatabaseTargetFingerprint(databaseUrl: string): string {
  const url = parseDatabaseUrl(databaseUrl);
  const protocol = url.protocol === 'postgres:' || url.protocol === 'postgresql:'
    ? 'postgresql:'
    : url.protocol.toLowerCase();
  const port = url.port || String(POSTGRES_INTERNAL_PORT);
  const database = decodedDatabaseName(url);
  let user: string;
  try {
    user = decodeURIComponent(url.username);
  } catch {
    return reject('the database user is malformed');
  }

  return createHash('sha256')
    .update(`${protocol}|${url.hostname.toLowerCase()}|${port}|${user}|${database}`)
    .digest('hex');
}

export function databaseUrlFor(runtime: DisposablePostgresRuntime, database: string): string {
  const url = new URL('postgresql://127.0.0.1');
  url.username = runtime.user;
  url.password = runtime.password;
  url.port = String(runtime.port);
  url.pathname = `/${database}`;
  return url.toString();
}

export function databaseTarget(
  runtime: DisposablePostgresRuntime,
  database: string,
): DisposableDatabaseTarget {
  return {
    runtime,
    database,
    databaseUrl: databaseUrlFor(runtime, database),
    fingerprint: databaseFingerprint(runtime.runFingerprint, database),
  };
}

export function assertStaticDatabaseSafety(target: DisposableDatabaseTarget): void {
  const { runtime } = target;
  if (runtime.optIn !== OPT_IN_VALUE) {
    reject('the explicit destructive-test opt-in is absent');
  }
  if (!CONTAINER_ID_PATTERN.test(runtime.containerId)) {
    reject('the runner-issued container identity is malformed');
  }
  if (!DATABASE_NAME_PATTERN.test(target.database)) {
    reject('the database name is not scoped to this disposable test run');
  }
  if (!target.database.startsWith(`${DATABASE_PREFIX}_${runtime.runId}_`)) {
    reject('the database name belongs to a different disposable test run');
  }
  if (FORBIDDEN_ENVIRONMENT_LABEL.test(target.database)
    || FORBIDDEN_ENVIRONMENT_LABEL.test(runtime.user)
    || FORBIDDEN_ENVIRONMENT_LABEL.test(runtime.containerName)) {
    reject('an environment label is forbidden');
  }

  const url = parseDatabaseUrl(target.databaseUrl);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    reject('only PostgreSQL URLs are allowed');
  }
  if (url.hostname !== '127.0.0.1') {
    reject('the target host is not the runner-issued loopback endpoint');
  }
  if (Number.parseInt(url.port, 10) !== runtime.port) {
    reject('the target port differs from the runner-issued Docker mapping');
  }
  if (decodedDatabaseName(url) !== target.database) {
    reject('the URL database differs from the guarded database');
  }

  let decodedUser: string;
  let decodedPassword: string;
  try {
    decodedUser = decodeURIComponent(url.username);
    decodedPassword = decodeURIComponent(url.password);
  } catch {
    return reject('the database credentials are malformed');
  }
  if (decodedUser !== runtime.user || decodedPassword !== runtime.password) {
    reject('the URL credentials were not generated by this disposable run');
  }
  if (url.search || url.hash) {
    reject('unexpected URL options are present');
  }
  if (target.databaseUrl !== databaseUrlFor(runtime, target.database)) {
    reject('the URL is not the exact runner-generated target');
  }
  if (target.fingerprint !== databaseFingerprint(runtime.runFingerprint, target.database)) {
    reject('the expected database fingerprint is malformed');
  }
  if (runtime.forbiddenTargetFingerprints.has(
    canonicalDatabaseTargetFingerprint(target.databaseUrl),
  )) {
    reject('the target matches a known non-test database');
  }
}

async function inspectContainer(
  runtime: Pick<DisposablePostgresRuntime, 'containerId'>,
): Promise<DockerInspectRecord> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('docker', ['inspect', runtime.containerId], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
      killSignal: 'SIGKILL',
    }));
  } catch {
    return reject('the runner-issued Docker container cannot be inspected');
  }

  try {
    const records = JSON.parse(stdout) as DockerInspectRecord[];
    if (records.length !== 1) reject('Docker returned an ambiguous container identity');
    return records[0];
  } catch (error) {
    if (error instanceof DatabaseSafetyError) throw error;
    return reject('Docker returned an invalid container fingerprint');
  }
}

function assertBaseContainerIdentity(
  identity: DisposableContainerIdentity,
  record: DockerInspectRecord,
): void {
  assertApprovedPostgresImageReference(POSTGRES_IMAGE);
  const labels = record.Config?.Labels ?? {};
  const tmpfs = record.HostConfig?.Tmpfs ?? {};
  const dataMount = record.Mounts?.find(
    ({ Destination }) => Destination === '/var/lib/postgresql/data',
  );

  if (!CONTAINER_ID_PATTERN.test(identity.containerId)
    || record.Id !== identity.containerId
    || record.Name !== `/${identity.containerName}`) {
    reject('Docker container ID or name differs from the runner context');
  }
  if (!IMAGE_ID_PATTERN.test(identity.containerImageId)
    || record.Config?.Image !== POSTGRES_IMAGE
    || record.Image !== identity.containerImageId) {
    reject('Docker image identity differs from the pinned PostgreSQL image');
  }
  if (labels[DOCKER_LABELS.disposable] !== 'true'
    || labels[DOCKER_LABELS.runId] !== identity.runId
    || labels[DOCKER_LABELS.repositoryId] !== identity.repositoryId
    || labels[DOCKER_LABELS.fingerprint] !== identity.runFingerprint) {
    reject('Docker disposable labels do not match this run');
  }
  if (!Object.hasOwn(tmpfs, '/var/lib/postgresql/data')
    || (dataMount && dataMount.Type !== 'tmpfs')) {
    reject('PostgreSQL data is not isolated on the expected tmpfs');
  }
  if ((record.HostConfig?.Binds ?? []).some((bind) => bind.includes('/var/lib/postgresql/data'))) {
    reject('a persistent bind is attached to PostgreSQL data');
  }
  if (!record.HostConfig?.AutoRemove || record.HostConfig.RestartPolicy?.Name !== 'no') {
    reject('the PostgreSQL container is not disposable by lifecycle policy');
  }
}

export async function assertStartedDisposableContainer(
  identity: DisposableContainerIdentity,
): Promise<void> {
  assertBaseContainerIdentity(identity, await inspectContainer(identity));
}

export async function assertDisposableContainer(
  runtime: DisposablePostgresRuntime,
  options: { allowUnhealthy?: boolean; inspect?: SafetyDependencies['inspectContainer'] } = {},
): Promise<void> {
  const record = await (options.inspect ?? inspectContainer)(runtime);
  const portBinding = record.NetworkSettings?.Ports?.[`${POSTGRES_INTERNAL_PORT}/tcp`];
  assertBaseContainerIdentity(runtime, record);
  if (!Array.isArray(portBinding) || portBinding.length !== 1
    || portBinding[0].HostIp !== '127.0.0.1'
    || Number.parseInt(portBinding[0].HostPort ?? '', 10) !== runtime.port) {
    reject('Docker port mapping differs from the guarded loopback endpoint');
  }
  if (!options.allowUnhealthy) {
    if (!record.State?.Running || record.State.Health?.Status !== 'healthy') {
      reject('the disposable PostgreSQL container is not running and healthy');
    }
  }
}

async function connect(target: DisposableDatabaseTarget): Promise<PgClient> {
  const client = new Client({
    connectionString: target.databaseUrl,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 5_000,
    query_timeout: 5_000,
    ssl: false,
    options: '-c search_path=public',
    client_encoding: 'UTF8',
    application_name: `site-integration-guard-${target.runtime.runId}`,
  });
  await client.connect();
  return client;
}

async function assertLiveDatabaseFingerprint(
  client: PgClient,
  target: DisposableDatabaseTarget,
  allowUnmarked: boolean,
): Promise<void> {
  const result = await client.query<DatabaseFingerprintRow>(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      inet_server_addr()::text AS server_address,
      inet_server_port() AS server_port,
      current_setting('server_version_num') AS server_version_num,
      pg_get_userbyid(database_record.datdba) AS database_owner,
      shobj_description(database_record.oid, 'pg_database') AS database_comment
    FROM pg_database AS database_record
    WHERE database_record.datname = current_database()
  `);
  const row = result.rows[0];
  const serverVersion = Number.parseInt(row?.server_version_num ?? '', 10);

  if (!row
    || row.database_name !== target.database
    || row.database_user !== target.runtime.user
    || row.database_owner !== target.runtime.user
    || row.server_port !== POSTGRES_INTERNAL_PORT
    || !row.server_address
    || serverVersion < 160_000
    || serverVersion >= 170_000) {
    reject('the connected database fingerprint does not match PostgreSQL 16 in this run');
  }
  if (allowUnmarked) {
    if (row.database_comment !== null) {
      reject('an unmarked database unexpectedly has a fingerprint');
    }
  } else if (row.database_comment !== target.fingerprint) {
    reject('the connected database marker does not match this run');
  }
}

export async function withVerifiedDisposableDatabase<T>(
  target: DisposableDatabaseTarget,
  operation: GuardedDatabaseOperation,
  action: (client: PgClient) => Promise<T>,
  options: {
    allowUnmarked?: boolean;
    dependencies?: SafetyDependencies;
  } = {},
): Promise<T> {
  if (options.allowUnmarked && operation !== 'bootstrap-fingerprint') {
    reject('only fingerprint bootstrap may access an unmarked database');
  }
  assertStaticDatabaseSafety(target);
  await assertDisposableContainer(target.runtime, {
    inspect: options.dependencies?.inspectContainer,
  });

  let client: PgClient | undefined;
  try {
    client = await (options.dependencies?.connect ?? connect)(target);
    await assertLiveDatabaseFingerprint(client, target, options.allowUnmarked ?? false);
  } catch (error) {
    await client?.end().catch(() => undefined);
    if (error instanceof DatabaseSafetyError) throw error;
    return reject('the live database fingerprint could not be verified');
  }

  try {
    return await action(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function sanitizeDatabaseDiagnostics(
  value: unknown,
  secrets: readonly string[] = [],
): string {
  let text = value instanceof Error ? value.message : String(value);
  text = text.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_DATABASE_URL]');
  for (const secret of [...secrets].sort((left, right) => right.length - left.length)) {
    if (!secret) continue;
    text = text.split(secret).join('[REDACTED]');
    try {
      text = text.split(encodeURIComponent(secret)).join('[REDACTED]');
    } catch {
      // The exact unencoded value was already removed.
    }
  }
  return text.slice(-12_000);
}
