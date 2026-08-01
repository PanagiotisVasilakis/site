import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  sanitizeDatabaseDiagnostics,
  withVerifiedDisposableDatabase,
} from './database-safety';
import type { DisposableDatabaseTarget } from './database-safety';
import {
  REPOSITORY_ROOT,
  runtimeEnvironment,
  safeChildEnvironment,
} from './runtime';

const MIGRATION_FILE_MANIFEST = {
  'prisma/migrations/migration_lock.toml': '99836963713b4f5b269ad49af0ed3d7b0b2e336115c2f92dc9ac683d139d0900',
  'prisma/migrations/000_init/migration.sql': 'f25a3d005ffa2ba6573ab36e8c0849b59d1db7983c8925ee64a9983584ea2c25',
  'prisma/migrations/001_add_session_created_at/migration.sql': '86d3a2b83e570c6a7b1a9142086ca242e90c78dcdfca712e5f0c754c562502c9',
  'prisma/migrations/20251014185403_add_composite_indexes/migration.sql': '2340d607ff2b3f8d8d2db244598835e07e23bc94e9c13f1013cbac9699099fac',
  'prisma/migrations/20260426201500_add_check_in_requests/migration.sql': '8f5593d87e7cb1a8bffa61ffbecfd1ae9ff4663d01efa07e5d11ebe179a79c5f',
  'prisma/migrations/20260714090000_comprehensive_remediation/migration.sql': '7350e9490019ec84d2431489477c3b395c66a5af2cb59655642ce10c9bf8bb2a',
  'prisma/migrations/20260714145900_preserve_booking_ownership/migration.sql': 'e2d6c8542bf5570827f99e4146cbf4b7e6b8d5f1abadfbee357ad3fbad899cb8',
  'prisma/migrations/20260714150000_trustworthy_portal_and_operations/migration.sql': '34332d763f7ecb1617a3a4758fa9c5168749051411640319bb17ff2061aeae25',
  'prisma/migrations/20260715100000_enforce_booking_ownership_invariant/migration.sql': '5250299bd2f3cda62783276a1c76bf1127050f1cb246c9414513cf35b36f4578',
  'prisma/migrations/20260715101000_normalize_stay_request_phones/migration.sql': 'a3f59f9ce766b5b70a20d8fee9ed67fb6b1f4564e11205dbc7140e0a48d73629',
  'prisma/migrations/20260715102000_idempotent_analytics_occurrence/migration.sql': '0d7f5441078969be2d5bb7cdf3488f0260f45907baa1d4195a146c4beec3178f',
  'prisma/migrations/20260715103000_track_booking_updates/migration.sql': 'a4407555ccac11e9f99c071c9f37e2b5c7908987b800b285ba4249385ae768eb',
  'prisma/migrations/20260715104000_unique_open_erasure_request/migration.sql': '9e9fdd4aca6a969f9a57fa5c19c06f89cc7544ab0ebb208b1d8acebf7a89f276',
  'prisma/migrations/20260715105000_recover_legacy_outbox_leases/migration.sql': 'b77537144ae8523db9d9f3b25cb07fd016773ca54aebaee812898a788a035272',
  'prisma/migrations/20260715110000_remove_unused_legacy_models/migration.sql': '94a00297c507e8c8aed855725fd204cd37797f5f915e801dc8bc510582562967',
} as const;

const EXPECTED_MIGRATIONS = Object.entries(MIGRATION_FILE_MANIFEST)
  .filter(([file]) => file.endsWith('/migration.sql'))
  .map(([file, checksum]) => ({
    name: file.split('/').at(-2) as string,
    checksum,
  }));

interface MigrationRecord {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  logs: string | null;
}

async function listMigrationFiles(): Promise<string[]> {
  const root = path.join(REPOSITORY_ROOT, 'prisma/migrations');
  const entries = await readdir(root, { withFileTypes: true });
  const files = ['prisma/migrations/migration_lock.toml'];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const migrationFile = path.join(root, entry.name, 'migration.sql');
    try {
      await readFile(migrationFile);
      files.push(`prisma/migrations/${entry.name}/migration.sql`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return files.sort();
}

export async function migrationFileHashes(): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const relativeFile of await listMigrationFiles()) {
    const contents = await readFile(path.join(REPOSITORY_ROOT, relativeFile));
    hashes[relativeFile] = createHash('sha256').update(contents).digest('hex');
  }
  return hashes;
}

export async function assertCommittedMigrationManifest(): Promise<void> {
  const actual = await migrationFileHashes();
  const expected = Object.fromEntries(
    Object.entries(MIGRATION_FILE_MANIFEST).sort(([left], [right]) => left.localeCompare(right)),
  );
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Migration files differ from the committed integration-test manifest.');
  }
}

interface CommandResult {
  exitCode: number;
  output: string;
}

const MIGRATION_TIMEOUT_MS = 60_000;
const TERMINATION_GRACE_MS = 2_000;

function signalChildProcess(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
): void {
  if (!child.pid) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to signalling the direct process if the group already changed.
    }
  }
  child.kill(signal);
}

function runPrismaMigrateProcess(target: DisposableDatabaseTarget): Promise<CommandResult> {
  const prismaBinary = path.join(REPOSITORY_ROOT, 'node_modules/.bin/prisma');
  const childEnvironment: NodeJS.ProcessEnv = {
    ...safeChildEnvironment(),
    ...runtimeEnvironment(target.runtime),
    TEST_DATABASE_URL: target.databaseUrl,
    DATABASE_URL: target.databaseUrl,
    DIRECT_URL: target.databaseUrl,
    NO_COLOR: '1',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
  };

  return new Promise((resolve, reject) => {
    const child = spawn(
      prismaBinary,
      ['migrate', 'deploy', '--config', 'prisma.integration.config.ts'],
      {
        cwd: REPOSITORY_ROOT,
        env: childEnvironment,
        detached: process.platform !== 'win32',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const chunks: Buffer[] = [];
    let capturedBytes = 0;
    let settled = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const terminate = (signal: NodeJS.Signals) => {
      signalChildProcess(child, signal);
      if (killTimer) clearTimeout(killTimer);
      killTimer = setTimeout(() => signalChildProcess(child, 'SIGKILL'), TERMINATION_GRACE_MS);
    };
    const onSigint = () => terminate('SIGINT');
    const onSigterm = () => terminate('SIGTERM');
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate('SIGTERM');
    }, MIGRATION_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
    };
    const capture = (chunk: Buffer) => {
      if (capturedBytes >= 256 * 1024) return;
      const bounded = chunk.subarray(0, 256 * 1024 - capturedBytes);
      chunks.push(bounded);
      capturedBytes += bounded.length;
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        exitCode: timedOut ? 124 : (code ?? (signal ? 1 : 0)),
        output: `${Buffer.concat(chunks).toString('utf8')}${
          timedOut ? '\nMigration process exceeded the bounded test timeout.' : ''
        }`,
      });
    });
  });
}

export async function applyMigrationsFromEmpty(
  target: DisposableDatabaseTarget,
): Promise<void> {
  await assertCommittedMigrationManifest();
  await withVerifiedDisposableDatabase(target, 'migration', async () => {
    let result: CommandResult;
    try {
      result = await runPrismaMigrateProcess(target);
    } catch (error) {
      throw new Error(`Migration command could not start: ${sanitizeDatabaseDiagnostics(error, [
        target.databaseUrl,
        target.runtime.user,
        target.runtime.password,
      ])}`);
    }
    if (result.exitCode !== 0) {
      const diagnostic = sanitizeDatabaseDiagnostics(result.output, [
        target.databaseUrl,
        target.runtime.user,
        target.runtime.password,
      ]);
      throw new Error(`Migration command failed with exit code ${result.exitCode}. ${diagnostic}`);
    }
  });
  await assertCommittedMigrationManifest();
}

async function readAppliedMigrationHistory(
  target: DisposableDatabaseTarget,
): Promise<MigrationRecord[]> {
  return withVerifiedDisposableDatabase(target, 'verification', async (client) => {
    const result = await client.query<MigrationRecord>(`
      SELECT migration_name, checksum, finished_at, rolled_back_at, logs
      FROM _prisma_migrations
      ORDER BY started_at, migration_name
    `);
    return result.rows;
  });
}

export async function assertCompleteMigrationHistory(
  target: DisposableDatabaseTarget,
): Promise<void> {
  const history = await readAppliedMigrationHistory(target);
  if (history.length !== EXPECTED_MIGRATIONS.length) {
    throw new Error('Disposable database has an incomplete migration history.');
  }
  history.forEach((record, index) => {
    const expected = EXPECTED_MIGRATIONS[index];
    if (record.migration_name !== expected.name
      || record.checksum !== expected.checksum
      || !record.finished_at
      || record.rolled_back_at
      || record.logs) {
      throw new Error('Disposable database migration history does not match the committed chain.');
    }
  });
}

export async function hasMigrationHistoryTable(
  target: DisposableDatabaseTarget,
): Promise<boolean> {
  return withVerifiedDisposableDatabase(target, 'verification', async (client) => {
    const result = await client.query<{ relation: string | null }>(
      `SELECT to_regclass('public._prisma_migrations')::text AS relation`,
    );
    return result.rows[0]?.relation === '_prisma_migrations';
  });
}

export async function installMigrationFailureFixture(
  target: DisposableDatabaseTarget,
): Promise<void> {
  await withVerifiedDisposableDatabase(target, 'failure-fixture', async (client) => {
    await client.query('CREATE TABLE users (id text PRIMARY KEY)');
  });
}
