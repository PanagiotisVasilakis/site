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
  readDisposablePostgresRuntime,
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

function validDockerInspection(runtime: DisposablePostgresRuntime): DockerInspection {
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

interface DockerInspection {
  Id: string;
  Image: string;
  Name: string;
  Config: { Image: string; Labels: Record<string, string> };
  State: { Running: boolean; Health: { Status: string } };
  HostConfig: {
    Tmpfs: Record<string, string>;
    Binds: string[];
    AutoRemove: boolean;
    RestartPolicy: { Name: string };
  };
  Mounts: Array<{ Destination: string; Type: string }>;
  NetworkSettings: {
    Ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
  };
}

interface LiveDatabaseRow {
  database_name: string;
  database_user: string;
  server_address: string | null;
  server_port: number;
  server_version_num: string;
  database_owner: string;
  database_comment: string | null;
}

type DockerInspectionMutation = (
  inspection: DockerInspection,
  runtime: DisposablePostgresRuntime,
) => void;

function validLiveRow(runtime: DisposablePostgresRuntime, comment: string | null): LiveDatabaseRow {
  return {
    database_name: database,
    database_user: runtime.user,
    server_address: '172.18.0.2',
    server_port: 5432,
    server_version_num: '160010',
    database_owner: runtime.user,
    database_comment: comment,
  };
}

function liveDatabaseDependencies(runtime: DisposablePostgresRuntime, row: LiveDatabaseRow) {
  const end = vi.fn().mockResolvedValue(undefined);
  const query = vi.fn().mockResolvedValue({ rows: [row] });
  return {
    end,
    dependencies: {
      inspectContainer: vi.fn().mockResolvedValue(validDockerInspection(runtime)),
      connect: vi.fn().mockResolvedValue({ query, end }),
    },
  };
}

function runnerEnvironment(runtime: DisposablePostgresRuntime): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', ...runtimeEnvironment(runtime) };
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

  const runtimeIdentityRows: Array<[string, (runtime: DisposablePostgresRuntime) => void, string]> = [
    [
      'an environment label in the user name',
      (runtime) => {
        runtime.user = `${DATABASE_PREFIX}_${runId}_production`;
      },
      'an environment label is forbidden',
    ],
    [
      'an environment label in the container name',
      (runtime) => {
        runtime.containerName = `site-integration-test-${runId}-staging`;
      },
      'an environment label is forbidden',
    ],
    [
      'a malformed runner-issued container ID',
      (runtime) => {
        runtime.containerId = 'g'.repeat(64);
      },
      'the runner-issued container identity is malformed',
    ],
  ];

  it.each(runtimeIdentityRows)(
    'rejects %s before Docker inspection, connection, or SQL',
    async (_scenario, mutate, reason) => {
      const runtime = safeRuntime();
      mutate(runtime);
      const target = databaseTarget(runtime, database);
      const inspectContainer = vi.fn().mockResolvedValue(validDockerInspection(runtime));
      const connect = vi.fn();
      const migration = vi.fn();

      await expect(withVerifiedDisposableDatabase(
        target,
        'migration',
        migration,
        { dependencies: { inspectContainer, connect } },
      )).rejects.toThrow(reason);
      expect(inspectContainer).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
      expect(migration).not.toHaveBeenCalled();
    },
  );

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

  const dockerInspectionRows: Array<[string, DockerInspectionMutation, string]> = [
    [
      'a missing tmpfs data directory',
      (inspection) => {
        inspection.HostConfig.Tmpfs = {};
      },
      'PostgreSQL data is not isolated on the expected tmpfs',
    ],
    [
      'a data directory mounted from a non-tmpfs volume',
      (inspection) => {
        inspection.Mounts = [{ Destination: '/var/lib/postgresql/data', Type: 'volume' }];
      },
      'PostgreSQL data is not isolated on the expected tmpfs',
    ],
    [
      'a persistent bind on the data directory',
      (inspection) => {
        inspection.HostConfig.Binds = ['/srv/pg-data:/var/lib/postgresql/data'];
      },
      'a persistent bind is attached to PostgreSQL data',
    ],
    [
      'AutoRemove disabled',
      (inspection) => {
        inspection.HostConfig.AutoRemove = false;
      },
      'the PostgreSQL container is not disposable by lifecycle policy',
    ],
    [
      'a restart policy other than no',
      (inspection) => {
        inspection.HostConfig.RestartPolicy = { Name: 'always' };
      },
      'the PostgreSQL container is not disposable by lifecycle policy',
    ],
    [
      'a port published on another host address',
      (inspection, runtime) => {
        inspection.NetworkSettings.Ports['5432/tcp'] = [
          { HostIp: '0.0.0.0', HostPort: String(runtime.port) },
        ];
      },
      'Docker port mapping differs from the guarded loopback endpoint',
    ],
    [
      'a port published on another host port',
      (inspection, runtime) => {
        inspection.NetworkSettings.Ports['5432/tcp'] = [
          { HostIp: '127.0.0.1', HostPort: String(runtime.port + 1) },
        ];
      },
      'Docker port mapping differs from the guarded loopback endpoint',
    ],
    [
      'two port bindings',
      (inspection, runtime) => {
        const binding = { HostIp: '127.0.0.1', HostPort: String(runtime.port) };
        inspection.NetworkSettings.Ports['5432/tcp'] = [binding, { ...binding }];
      },
      'Docker port mapping differs from the guarded loopback endpoint',
    ],
    [
      'no published port',
      (inspection) => {
        inspection.NetworkSettings.Ports['5432/tcp'] = null;
      },
      'Docker port mapping differs from the guarded loopback endpoint',
    ],
    [
      'a container that is not healthy',
      (inspection) => {
        inspection.State.Health = { Status: 'starting' };
      },
      'the disposable PostgreSQL container is not running and healthy',
    ],
    [
      'a container that is not running',
      (inspection) => {
        inspection.State.Running = false;
      },
      'the disposable PostgreSQL container is not running and healthy',
    ],
    [
      'a disposable label that is not true',
      (inspection) => {
        inspection.Config.Labels[DOCKER_LABELS.disposable] = 'false';
      },
      'Docker disposable labels do not match this run',
    ],
    [
      'a repository identity label of another repository',
      (inspection) => {
        inspection.Config.Labels[DOCKER_LABELS.repositoryId] = 'f'.repeat(16);
      },
      'Docker disposable labels do not match this run',
    ],
    [
      'a run fingerprint label of another run',
      (inspection) => {
        inspection.Config.Labels[DOCKER_LABELS.fingerprint] = 'f'.repeat(48);
      },
      'Docker disposable labels do not match this run',
    ],
    [
      'a container ID that differs from the runner context',
      (inspection) => {
        inspection.Id = 'f'.repeat(64);
      },
      'Docker container ID or name differs from the runner context',
    ],
    [
      'a container name that differs from the runner context',
      (inspection) => {
        inspection.Name = '/site-integration-test-ffffffffffff';
      },
      'Docker container ID or name differs from the runner context',
    ],
  ];

  it.each(dockerInspectionRows)(
    'rejects Docker inspection with %s before connection or SQL',
    async (_scenario, mutate, reason) => {
      const runtime = safeRuntime();
      const target = databaseTarget(runtime, database);
      const inspection = validDockerInspection(runtime);
      mutate(inspection, runtime);
      const inspectContainer = vi.fn().mockResolvedValue(inspection);
      const connect = vi.fn();
      const migration = vi.fn();

      await expect(withVerifiedDisposableDatabase(
        target,
        'migration',
        migration,
        { dependencies: { inspectContainer, connect } },
      )).rejects.toThrow(reason);
      expect(connect).not.toHaveBeenCalled();
      expect(migration).not.toHaveBeenCalled();
    },
  );

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

  const liveDatabaseRows: Array<[string, (row: LiveDatabaseRow) => void, string]> = [
    [
      'another database user',
      (row) => {
        row.database_user = 'postgres';
      },
      'the connected database fingerprint does not match PostgreSQL 16 in this run',
    ],
    [
      'another database owner',
      (row) => {
        row.database_owner = 'postgres';
      },
      'the connected database fingerprint does not match PostgreSQL 16 in this run',
    ],
    [
      'another server port',
      (row) => {
        row.server_port = 5433;
      },
      'the connected database fingerprint does not match PostgreSQL 16 in this run',
    ],
    [
      'no server address',
      (row) => {
        row.server_address = null;
      },
      'the connected database fingerprint does not match PostgreSQL 16 in this run',
    ],
    [
      'a PostgreSQL 15 server version',
      (row) => {
        row.server_version_num = '150000';
      },
      'the connected database fingerprint does not match PostgreSQL 16 in this run',
    ],
    [
      'a PostgreSQL 17 server version',
      (row) => {
        row.server_version_num = '170000';
      },
      'the connected database fingerprint does not match PostgreSQL 16 in this run',
    ],
    [
      'a marker from another run',
      (row) => {
        row.database_comment = `qr-city-guide-integration:${'f'.repeat(64)}`;
      },
      'the connected database marker does not match this run',
    ],
  ];

  it.each(liveDatabaseRows)(
    'rejects a live database with %s before SQL',
    async (_scenario, mutate, reason) => {
      const runtime = safeRuntime();
      const target = databaseTarget(runtime, database);
      const row = validLiveRow(runtime, target.fingerprint);
      mutate(row);
      const { end, dependencies } = liveDatabaseDependencies(runtime, row);
      const migration = vi.fn();

      await expect(withVerifiedDisposableDatabase(
        target,
        'migration',
        migration,
        { dependencies },
      )).rejects.toThrow(reason);
      expect(migration).not.toHaveBeenCalled();
      expect(end).toHaveBeenCalledTimes(1);
    },
  );

  it('accepts the runner-issued container and the marked live database', async () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    const { end, dependencies } = liveDatabaseDependencies(
      runtime,
      validLiveRow(runtime, target.fingerprint),
    );
    const migration = vi.fn().mockResolvedValue('migrated');

    await expect(withVerifiedDisposableDatabase(
      target,
      'migration',
      migration,
      { dependencies },
    )).resolves.toBe('migrated');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('rejects fingerprint bootstrap on an unmarked database that already has a fingerprint', async () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    const { end, dependencies } = liveDatabaseDependencies(
      runtime,
      validLiveRow(runtime, target.fingerprint),
    );
    const bootstrap = vi.fn();

    await expect(withVerifiedDisposableDatabase(
      target,
      'bootstrap-fingerprint',
      bootstrap,
      { allowUnmarked: true, dependencies },
    )).rejects.toThrow('an unmarked database unexpectedly has a fingerprint');
    expect(bootstrap).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('accepts fingerprint bootstrap on an unmarked database without a fingerprint', async () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    const { dependencies } = liveDatabaseDependencies(runtime, validLiveRow(runtime, null));
    const bootstrap = vi.fn().mockResolvedValue('bootstrapped');

    await expect(withVerifiedDisposableDatabase(
      target,
      'bootstrap-fingerprint',
      bootstrap,
      { allowUnmarked: true, dependencies },
    )).resolves.toBe('bootstrapped');
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('rejects allowUnmarked access for a non-bootstrap operation before any I/O', async () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    const { dependencies } = liveDatabaseDependencies(runtime, validLiveRow(runtime, null));
    const migration = vi.fn();

    await expect(withVerifiedDisposableDatabase(
      target,
      'migration',
      migration,
      { allowUnmarked: true, dependencies },
    )).rejects.toThrow('only fingerprint bootstrap may access an unmarked database');
    expect(dependencies.inspectContainer).not.toHaveBeenCalled();
    expect(dependencies.connect).not.toHaveBeenCalled();
    expect(migration).not.toHaveBeenCalled();
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

  const runtimeEnvironmentRows: Array<[string, Partial<DisposablePostgresRuntime>, string]> = [
    [
      'a user from another run',
      { user: `${DATABASE_PREFIX}_ffffffffffff` },
      'Disposable PostgreSQL user does not match the current run.',
    ],
    [
      'a control database from another run',
      { controlDatabase: `${DATABASE_PREFIX}_ffffffffffff_control` },
      'Disposable PostgreSQL control database does not match the current run.',
    ],
    [
      'mapped port 0',
      { port: 0 },
      'Disposable PostgreSQL mapped port is malformed.',
    ],
    [
      'mapped port 65536',
      { port: 65_536 },
      'Disposable PostgreSQL mapped port is malformed.',
    ],
  ];

  it.each(runtimeEnvironmentRows)(
    'rejects a runner environment with %s',
    (_scenario, overrides, message) => {
      expect(() => readDisposablePostgresRuntime(
        runnerEnvironment({ ...safeRuntime(), ...overrides }),
      )).toThrow(message);
    },
  );

  it('reads the runner environment back into the same runtime identity', () => {
    expect(readDisposablePostgresRuntime(runnerEnvironment(safeRuntime())))
      .toEqual(safeRuntime());
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

  it('shows every cause of an AggregateError and still redacts the secrets inside them', () => {
    const runtime = safeRuntime();
    const target = databaseTarget(runtime, database);
    const aggregate = new AggregateError(
      [
        new Error(`connect ECONNREFUSED ${target.databaseUrl}`),
        new Error(`the runner-issued Docker container cannot be inspected for ${runtime.password}`),
      ],
      'Database teardown verification and exact-container removal both failed closed.',
    );
    const diagnostic = sanitizeDatabaseDiagnostics(
      aggregate,
      [target.databaseUrl, runtime.user, runtime.password],
    );
    expect(diagnostic).toContain('Database teardown verification and exact-container removal both failed closed.');
    expect(diagnostic).toContain('connect ECONNREFUSED [REDACTED_DATABASE_URL]');
    expect(diagnostic).toContain('the runner-issued Docker container cannot be inspected for [REDACTED]');
    expect(diagnostic).not.toContain(runtime.password);
    expect(diagnostic).not.toContain('postgresql://');
  });
});
