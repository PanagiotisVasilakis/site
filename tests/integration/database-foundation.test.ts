import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { DisposableDatabaseTarget } from './support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from './support/database-lifecycle';
import {
  SYNTHETIC_FIXTURE,
  seedDeterministicFixtures,
  withTestPrismaClient,
} from './support/fixtures';
import {
  applyMigrationsFromEmpty,
  assertCommittedMigrationManifest,
  assertCompleteMigrationHistory,
  hasMigrationHistoryTable,
  installMigrationFailureFixture,
  migrationFileHashes,
} from './support/migrations';
import { readDisposablePostgresRuntime } from './support/runtime';

const runtime = readDisposablePostgresRuntime();
const allocatedDatabases = new Set<DisposableDatabaseTarget>();
let initialMigrationHashes: Record<string, string>;

async function allocate(label: string): Promise<DisposableDatabaseTarget> {
  const target = await createIsolatedDatabase(runtime, label);
  allocatedDatabases.add(target);
  return target;
}

async function release(target: DisposableDatabaseTarget): Promise<void> {
  await dropIsolatedDatabase(target);
  allocatedDatabases.delete(target);
}

describe.sequential('disposable PostgreSQL integration foundation', () => {
  beforeAll(async () => {
    await assertCommittedMigrationManifest();
    initialMigrationHashes = await migrationFileHashes();
  });

  afterEach(async () => {
    const leftovers = [...allocatedDatabases];
    allocatedDatabases.clear();
    await Promise.all(leftovers.map((target) => dropIsolatedDatabase(target)));
  });

  afterAll(async () => {
    await assertCommittedMigrationManifest();
    expect(await migrationFileHashes()).toEqual(initialMigrationHashes);
  });

  it('applies the complete migration chain from empty and exposes the final schema through Prisma', async () => {
    const target = await allocate('fresh_chain');
    await expect(hasMigrationHistoryTable(target)).resolves.toBe(false);

    await applyMigrationsFromEmpty(target);
    await assertCompleteMigrationHistory(target);
    await seedDeterministicFixtures(target);

    await withTestPrismaClient(target, async (prisma) => {
      await expect(prisma.user.findUnique({
        where: { id: SYNTHETIC_FIXTURE.userId },
        include: { bookings: true },
      })).resolves.toMatchObject({
        email: SYNTHETIC_FIXTURE.email,
        phoneE164: SYNTHETIC_FIXTURE.phoneE164,
        bookings: [{ id: SYNTHETIC_FIXTURE.bookingId }],
      });
      await expect(prisma.operationalSetting.findMany({
        orderBy: { key: 'asc' },
        select: { key: true },
      })).resolves.toEqual([
        { key: 'checkin_preferences' },
        { key: 'feature_flags' },
      ]);
    });

    await release(target);
  });

  it('creates clean isolated state for repeated and parallel worker lifecycles', async () => {
    const longSharedLabel = 'parallel_worker_label_that_exceeds_the_database_suffix_capacity';
    const [first, second] = await Promise.all([
      allocate(longSharedLabel),
      allocate(longSharedLabel),
    ]);
    await Promise.all([
      applyMigrationsFromEmpty(first),
      applyMigrationsFromEmpty(second),
    ]);

    await withTestPrismaClient(first, async (prisma) => {
      await expect(prisma.user.count()).resolves.toBe(0);
    });
    await withTestPrismaClient(second, async (prisma) => {
      await expect(prisma.user.count()).resolves.toBe(0);
    });

    await seedDeterministicFixtures(first);
    await withTestPrismaClient(first, async (prisma) => {
      await expect(prisma.user.count()).resolves.toBe(1);
    });
    await withTestPrismaClient(second, async (prisma) => {
      await expect(prisma.user.count()).resolves.toBe(0);
    });

    await seedDeterministicFixtures(second);
    await Promise.all([assertCompleteMigrationHistory(first), assertCompleteMigrationHistory(second)]);
    await Promise.all([release(first), release(second)]);
  });

  it('surfaces a clear sanitized error when the existing chain cannot be applied', async () => {
    const target = await allocate('migration_failure');
    await installMigrationFailureFixture(target);

    let failure: Error | undefined;
    try {
      await applyMigrationsFromEmpty(target);
    } catch (error) {
      failure = error as Error;
    }
    const diagnostic = failure?.message ?? '';
    const leakedKinds = [
      ['url', target.databaseUrl],
      ['password', target.runtime.password],
      ['user', target.runtime.user],
      ['scheme', 'postgresql://'],
    ].filter(([, secret]) => diagnostic.includes(secret)).map(([kind]) => kind);
    expect({
      failureCaptured: failure instanceof Error,
      hasBoundedFailure: diagnostic.includes('Migration command failed'),
      hasExpectedPrismaCode: diagnostic.includes('P3005'),
      leakedKinds,
    }).toEqual({
      failureCaptured: true,
      hasBoundedFailure: true,
      hasExpectedPrismaCode: true,
      leakedKinds: [],
    });

    await release(target);
  });
});
