import { describe, expect, it, vi } from 'vitest';

import {
  canonicalDatabaseTargetFingerprint,
  databaseTarget,
  sanitizeDatabaseDiagnostics,
  withVerifiedDisposableDatabase,
} from '../integration/support/database-safety';
import { guardedPrismaDatabaseUrl } from '../integration/support/prisma-config-safety';
import {
  DATABASE_PREFIX,
  DOCKER_LABELS,
  OPT_IN_VALUE,
  POSTGRES_IMAGE,
  databaseFingerprint,
  runtimeEnvironment,
} from '../integration/support/runtime';
import type { DisposablePostgresRuntime } from '../integration/support/runtime';

const runId = 'a1b2c3d4e5f6';
const database = `${DATABASE_PREFIX}_${runId}_guard`;

function safeRuntime(): DisposablePostgresRuntime {
  return {
    runId,
    runFingerprint: '1'.repeat(48),
    repositoryId: '2'.repeat(16),
    containerId: '3'.repeat(64),
    containerName: `site-integration-test-${runId}`,
    containerImageId: `sha256:${'4'.repeat(64)}`,
    port: 49_321,
    user: `${DATABASE_PREFIX}_${runId}`,
    password: 'synthetic-guard-password',
    controlDatabase: `${DATABASE_PREFIX}_${runId}_control`,
    forbiddenTargetFingerprints: new Set(),
    optIn: OPT_IN_VALUE,
  };
}

function validDockerInspection(runtime: DisposablePostgresRuntime) {
  return {
    Id: runtime.containerId,
    Image: runtime.containerImageId,
    Name: `/${runtime.containerName}`,
    Config: {
      Image: POSTGRES_IMAGE,
      Labels: {
        [DOCKER_LABELS.disposable]: 'true',
        [DOCKER_LABELS.runId]: runtime.runId,
        [DOCKER_LABELS.repositoryId]: runtime.repositoryId,
        [DOCKER_LABELS.fingerprint]: runtime.runFingerprint,
      },
    },
    State: { Running: true, Health: { Status: 'healthy' } },
    HostConfig: {
      Tmpfs: { '/var/lib/postgresql/data': 'rw,noexec,nosuid' },
      Binds: [],
      AutoRemove: true,
      RestartPolicy: { Name: 'no' },
    },
    Mounts: [],
    NetworkSettings: {
      Ports: {
        '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: String(runtime.port) }],
      },
    },
  };
}

describe('disposable PostgreSQL safety guard', () => {
  it.each([
    ['missing explicit opt-in', (runtime: DisposablePostgresRuntime) => ({ ...runtime, optIn: '' })],
    ['production-labelled database', (runtime: DisposablePostgresRuntime) => runtime],
    ['remote staging host', (runtime: DisposablePostgresRuntime) => runtime],
  ])('rejects %s before Docker inspection, connection, or destructive SQL', async (scenario, mutate) => {
    const runtime = mutate(safeRuntime());
    const baseline = databaseTarget(runtime, database);
    const target = scenario === 'production-labelled database'
      ? {
          ...baseline,
          database: `${DATABASE_PREFIX}_${runId}_production`,
          databaseUrl: baseline.databaseUrl.replace(`/${database}`, `/${DATABASE_PREFIX}_${runId}_production`),
          fingerprint: databaseFingerprint(runtime.runFingerprint, `${DATABASE_PREFIX}_${runId}_production`),
        }
      : scenario === 'remote staging host'
        ? { ...baseline, databaseUrl: baseline.databaseUrl.replace('127.0.0.1', 'staging.example.invalid') }
        : baseline;
    const inspectContainer = vi.fn();
    const connect = vi.fn();
    const destructiveSql = vi.fn();

    await expect(withVerifiedDisposableDatabase(
      target,
      scenario === 'missing explicit opt-in' ? 'cleanup' : 'migration',
      destructiveSql,
      { dependencies: { inspectContainer, connect } },
    )).rejects.toThrow('safety guard rejected');
    expect(inspectContainer).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(destructiveSql).not.toHaveBeenCalled();
  });

  it('rejects a runner-shaped URL that matches a known non-test target', async () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    runtime.forbiddenTargetFingerprints = new Set([
      canonicalDatabaseTargetFingerprint(target.databaseUrl),
    ]);
    const inspectContainer = vi.fn();
    const connect = vi.fn();
    const cleanup = vi.fn();

    await expect(withVerifiedDisposableDatabase(
      target,
      'cleanup',
      cleanup,
      { dependencies: { inspectContainer, connect } },
    )).rejects.toThrow('known non-test database');
    expect(inspectContainer).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('normalizes postgres and postgresql schemes when comparing known targets', () => {
    const target = databaseTarget(safeRuntime(), database);
    expect(canonicalDatabaseTargetFingerprint(target.databaseUrl.replace('postgresql:', 'postgres:')))
      .toBe(canonicalDatabaseTargetFingerprint(target.databaseUrl));
  });

  it('rejects a valid-looking database name from a different run before I/O', async () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, `${DATABASE_PREFIX}_ffffffffffff_foreign`);
    const inspectContainer = vi.fn();
    const connect = vi.fn();
    const migration = vi.fn();

    await expect(withVerifiedDisposableDatabase(
      target,
      'migration',
      migration,
      { dependencies: { inspectContainer, connect } },
    )).rejects.toThrow('different disposable test run');
    expect(inspectContainer).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(migration).not.toHaveBeenCalled();
  });

  it('rejects a Docker identity mismatch before connection or SQL', async () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    const inspection = validDockerInspection(runtime);
    inspection.Config.Labels[DOCKER_LABELS.runId] = 'ffffffffffff';
    const inspectContainer = vi.fn().mockResolvedValue(inspection);
    const connect = vi.fn();
    const cleanup = vi.fn();

    await expect(withVerifiedDisposableDatabase(
      target,
      'cleanup',
      cleanup,
      { dependencies: { inspectContainer, connect } },
    )).rejects.toThrow('Docker disposable labels');
    expect(connect).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it.each([
    ['configured image reference', (inspection: ReturnType<typeof validDockerInspection>) => {
      inspection.Config.Image = 'postgres:16-alpine';
    }],
    ['running image ID', (inspection: ReturnType<typeof validDockerInspection>) => {
      inspection.Image = `sha256:${'5'.repeat(64)}`;
    }],
  ])('rejects a mismatched %s before connection or SQL', async (_scenario, mutate) => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    const inspection = validDockerInspection(runtime);
    mutate(inspection);
    const connect = vi.fn();
    const cleanup = vi.fn();

    await expect(withVerifiedDisposableDatabase(
      target,
      'cleanup',
      cleanup,
      { dependencies: { inspectContainer: vi.fn().mockResolvedValue(inspection), connect } },
    )).rejects.toThrow('Docker image identity');
    expect(connect).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('closes the connection and rejects before SQL when the live fingerprint differs', async () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    const end = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue({
      rows: [{
        database_name: 'wrong_database',
        database_user: runtime.user,
        database_owner: runtime.user,
        server_address: '172.18.0.2',
        server_port: 5432,
        server_version_num: '160010',
        database_comment: target.fingerprint,
      }],
    });
    const connect = vi.fn().mockResolvedValue({ query, end });
    const migration = vi.fn();

    await expect(withVerifiedDisposableDatabase(
      target,
      'migration',
      migration,
      {
        dependencies: {
          inspectContainer: vi.fn().mockResolvedValue(validDockerInspection(runtime)),
          connect: connect as never,
        },
      },
    )).rejects.toThrow('connected database fingerprint');
    expect(migration).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('makes the Prisma integration config reject an arbitrary production URL', () => {
    const unsafeEnvironment = {
      NODE_ENV: 'test',
      TEST_DATABASE_URL: 'postgresql://prod-user:prod-password@production.example.invalid/production',
    } as NodeJS.ProcessEnv;
    expect(() => guardedPrismaDatabaseUrl(unsafeEnvironment)).toThrow('runner context');
  });

  it('allows the Prisma integration config only for the exact statically guarded URL', () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    const environment = {
      NODE_ENV: 'test',
      ...runtimeEnvironment(runtime),
      TEST_DATABASE_URL: target.databaseUrl,
    } as NodeJS.ProcessEnv;
    expect(guardedPrismaDatabaseUrl(environment)).toBe(target.databaseUrl);
  });

  it('redacts connection URLs and credentials from diagnostics', () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    const diagnostic = sanitizeDatabaseDiagnostics(
      `failed for ${target.databaseUrl}; user=${runtime.user}; password=${runtime.password}`,
      [target.databaseUrl, runtime.user, runtime.password],
    );
    const leakedKinds = [
      ['url', 'postgresql://'],
      ['user', runtime.user],
      ['password', runtime.password],
    ].filter(([, secret]) => diagnostic.includes(secret)).map(([kind]) => kind);
    expect(leakedKinds).toEqual([]);
    expect(diagnostic).toContain('[REDACTED');
  });
});
