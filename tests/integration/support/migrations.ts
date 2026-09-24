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
import { checkPrismaIntegrity } from '../../../scripts/lib/prisma-integrity.mjs';

interface ExpectedMigration {
  name: string;
  checksum: string;
}

// The canonical committed manifest; checkPrismaIntegrity fails closed on any drift.
function committedMigrationChain(): ExpectedMigration[] {
  const { manifest } = checkPrismaIntegrity(REPOSITORY_ROOT);
  return (manifest.migrations.files as Array<{ path: string; sha256: string }>)
    .filter((file) => file.path.endsWith('/migration.sql'))
    .map((file) => ({ name: file.path.split('/')[0], checksum: file.sha256 }));
}

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
  checkPrismaIntegrity(REPOSITORY_ROOT);
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
  const expectedMigrations = committedMigrationChain();
  const history = await readAppliedMigrationHistory(target);
  if (history.length !== expectedMigrations.length) {
    throw new Error('Disposable database has an incomplete migration history.');
  }
  history.forEach((record, index) => {
    const expected = expectedMigrations[index];
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
