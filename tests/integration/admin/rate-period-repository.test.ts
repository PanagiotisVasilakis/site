import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';
import { parseIsoDate, type IsoDate } from '@/lib/availability/calendarDate';

import type { DisposableDatabaseTarget } from '../support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { withTestPrismaClient } from '../support/fixtures';
import { applyMigrationsFromEmpty } from '../support/migrations';
import { readDisposablePostgresRuntime } from '../support/runtime';

const runtime = readDisposablePostgresRuntime();
const managedEnvironment = ['DATABASE_URL', 'LOG_CONSOLE', 'PRISMA_AUTO_DISCONNECT'] as const;
type ManagedEnvironmentName = typeof managedEnvironment[number];

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Rate period database was not initialized.');
  return target;
}

function date(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (parsed === null) throw new Error(`Invalid test date ${value}`);
  return parsed;
}

function period(startDate: string, endDate: string, nightlyPriceCents = 8_000, minimumNights = 1) {
  return { startDate: date(startDate), endDate: date(endDate), nightlyPriceCents, minimumNights };
}

describe.sequential('rate period repository on PostgreSQL', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'rate_period_repository');
    await applyMigrationsFromEmpty(target);
    for (const name of managedEnvironment) originalEnvironment.set(name, process.env[name]);
    process.env.DATABASE_URL = target.databaseUrl;
    process.env.LOG_CONSOLE = 'false';
    process.env.PRISMA_AUTO_DISCONNECT = 'false';
    applicationPrisma = (await import('@/lib/prisma')).prisma;
  });

  afterEach(async () => {
    if (target) {
      await withTestPrismaClient(requireTarget(), async (prisma) => {
        await prisma.ratePeriod.deleteMany();
      }, 'cleanup');
    }
  });

  afterAll(async () => {
    try {
      await applicationPrisma?.$disconnect();
      applicationPrisma = undefined;
    } finally {
      for (const name of managedEnvironment) {
        const value = originalEnvironment.get(name);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (target) await dropIsolatedDatabase(target);
      target = undefined;
    }
  });

  // The interleaving is not controlled: whichever of the pre-check, the
  // serialization retry or the exclusion constraint stops the loser, the
  // outcome must be one stored period and one RatePeriodOverlapError.
  it('lets exactly one of two concurrent overlapping creates succeed', async () => {
    const { createRatePeriod, RatePeriodOverlapError } = await import('@/lib/prisma-repositories/ratePeriodRepository');

    for (const month of ['01', '02', '03', '04', '05']) {
      const outcomes = await Promise.allSettled([
        createRatePeriod(period(`2041-${month}-01`, `2041-${month}-10`, 9_000)),
        createRatePeriod(period(`2041-${month}-05`, `2041-${month}-15`, 9_500)),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(RatePeriodOverlapError);
    }
    await expect(withTestPrismaClient(requireTarget(), (prisma) => prisma.ratePeriod.count())).resolves.toBe(5);
  });

  it('accepts adjacent periods, replaces a period over its own dates and lists by start date', async () => {
    const {
      createRatePeriod,
      deleteRatePeriod,
      listRatePeriods,
      RatePeriodNotFoundError,
      RatePeriodOverlapError,
      replaceRatePeriod,
    } = await import('@/lib/prisma-repositories/ratePeriodRepository');

    const later = await createRatePeriod(period('2042-06-01', '2042-07-01', 12_000, 3));
    const earlier = await createRatePeriod(period('2042-05-01', '2042-06-01', 8_550, 2));
    await expect(replaceRatePeriod(earlier.id, period('2042-05-03', '2042-06-01', 8_600, 2)))
      .resolves.toEqual({ id: earlier.id, ...period('2042-05-03', '2042-06-01', 8_600, 2) });
    await expect(replaceRatePeriod(earlier.id, period('2042-05-03', '2042-06-02')))
      .rejects.toBeInstanceOf(RatePeriodOverlapError);

    await expect(listRatePeriods()).resolves.toEqual([
      { id: earlier.id, startDate: '2042-05-03', endDate: '2042-06-01', nightlyPriceCents: 8_600, minimumNights: 2 },
      { id: later.id, startDate: '2042-06-01', endDate: '2042-07-01', nightlyPriceCents: 12_000, minimumNights: 3 },
    ]);

    await deleteRatePeriod(later.id);
    await expect(deleteRatePeriod(later.id)).rejects.toBeInstanceOf(RatePeriodNotFoundError);
    await expect(replaceRatePeriod(later.id, period('2042-06-01', '2042-07-01')))
      .rejects.toBeInstanceOf(RatePeriodNotFoundError);
    await expect(listRatePeriods()).resolves.toHaveLength(1);
  });
});
