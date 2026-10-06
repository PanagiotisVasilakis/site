import { randomUUID } from 'node:crypto';
import type { Client as PgClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Prisma } from '@/generated/prisma/client';

import type { DisposableDatabaseTarget } from './support/database-safety';
import { withVerifiedDisposableDatabase } from './support/database-safety';
import { createIsolatedDatabase, dropIsolatedDatabase } from './support/database-lifecycle';
import { withTestPrismaClient } from './support/fixtures';
import { applyMigrationsFromEmpty } from './support/migrations';
import { readDisposablePostgresRuntime } from './support/runtime';

const runtime = readDisposablePostgresRuntime();
let target: DisposableDatabaseTarget | undefined;

interface StatementOutcome {
  code?: string;
  constraint?: string;
}

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Availability schema database was not initialized.');
  return target;
}

// Raw checks run in one transaction that is always rolled back, so every test
// starts from the freshly migrated state (only the seeded singleton row).
function inRolledBackTransaction<T>(action: (client: PgClient) => Promise<T>): Promise<T> {
  return withVerifiedDisposableDatabase(requireTarget(), 'verification', async (client) => {
    await client.query('BEGIN');
    try {
      return await action(client);
    } finally {
      await client.query('ROLLBACK');
    }
  });
}

// One statement behind a savepoint: {} on success, otherwise the SQLSTATE and
// the violated constraint; the surrounding transaction stays usable.
async function attempt(client: PgClient, text: string, values: unknown[] = []): Promise<StatementOutcome> {
  await client.query('SAVEPOINT attempt');
  try {
    await client.query(text, values);
    await client.query('RELEASE SAVEPOINT attempt');
    return {};
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT attempt');
    const { code, constraint } = error as StatementOutcome;
    return { code, constraint };
  }
}

function insertRatePeriod(
  client: PgClient,
  startDate: string,
  endDate: string,
  nightlyPriceCents = 8_000,
  minimumNights = 1,
): Promise<StatementOutcome> {
  return attempt(client, `
    INSERT INTO rate_periods (id, start_date, end_date, nightly_price_cents, minimum_nights)
    VALUES ($1, $2::date, $3::date, $4, $5)
  `, [randomUUID(), startDate, endDate, nightlyPriceCents, minimumNights]);
}

function updateSyncState(client: PgClient, assignments: string): Promise<StatementOutcome> {
  return attempt(client, `UPDATE calendar_sync_state SET ${assignments} WHERE id = 'airbnb'`);
}

const utcMidnight = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

describe('availability calendar schema after the full migration chain', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'availability_schema');
    await applyMigrationsFromEmpty(target);
  });

  afterAll(async () => {
    if (target) await dropIsolatedDatabase(target);
    target = undefined;
  });

  it('creates both tables with the named checks and the rate period exclusion constraint', async () => {
    const constraints = await inRolledBackTransaction(async (client) => (await client.query<{
      relation: string;
      name: string;
      type: string;
      definition: string;
    }>(`
      SELECT conrelid::regclass::text AS relation, conname AS name, contype AS type,
             pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid IN ('public.rate_periods'::regclass, 'public.calendar_sync_state'::regclass)
      ORDER BY conrelid::regclass::text COLLATE "C", conname COLLATE "C"
    `)).rows);

    expect(constraints.map(({ relation, name, type }) => [relation, name, type])).toEqual([
      ['calendar_sync_state', 'calendar_sync_state_blocked_nights_check', 'c'],
      ['calendar_sync_state', 'calendar_sync_state_consecutive_failures_check', 'c'],
      ['calendar_sync_state', 'calendar_sync_state_horizon_check', 'c'],
      ['calendar_sync_state', 'calendar_sync_state_last_error_code_check', 'c'],
      ['calendar_sync_state', 'calendar_sync_state_last_http_status_check', 'c'],
      ['calendar_sync_state', 'calendar_sync_state_lease_check', 'c'],
      ['calendar_sync_state', 'calendar_sync_state_pkey', 'p'],
      ['calendar_sync_state', 'calendar_sync_state_singleton_check', 'c'],
      ['rate_periods', 'rate_periods_dates_check', 'c'],
      ['rate_periods', 'rate_periods_length_check', 'c'],
      ['rate_periods', 'rate_periods_minimum_nights_check', 'c'],
      ['rate_periods', 'rate_periods_no_overlap', 'x'],
      ['rate_periods', 'rate_periods_pkey', 'p'],
      ['rate_periods', 'rate_periods_price_check', 'c'],
    ]);
    expect(constraints.find(({ name }) => name === 'rate_periods_no_overlap')?.definition)
      .toBe("EXCLUDE USING gist (daterange(start_date, end_date, '[)'::text) WITH &&)");
  });

  it('rejects overlapping rate periods with SQLSTATE 23P01 and accepts adjacent [a,b) and [b,c)', async () => {
    const outcomes = await inRolledBackTransaction(async (client) => ({
      first: await insertRatePeriod(client, '2031-05-01', '2031-06-01'),
      adjacentAfter: await insertRatePeriod(client, '2031-06-01', '2031-07-01'),
      adjacentBefore: await insertRatePeriod(client, '2031-04-01', '2031-05-01'),
      identical: await insertRatePeriod(client, '2031-05-01', '2031-06-01'),
      inside: await insertRatePeriod(client, '2031-05-10', '2031-05-12'),
      covering: await insertRatePeriod(client, '2031-03-01', '2031-08-01'),
      lastNightOverlap: await insertRatePeriod(client, '2031-06-30', '2031-07-05'),
      firstNightOverlap: await insertRatePeriod(client, '2031-03-25', '2031-04-02'),
      updateIntoNeighbour: await attempt(
        client,
        `UPDATE rate_periods SET end_date = '2031-06-02' WHERE start_date = '2031-05-01'`,
      ),
    }));

    const overlap = { code: '23P01', constraint: 'rate_periods_no_overlap' };
    expect(outcomes).toEqual({
      first: {},
      adjacentAfter: {},
      adjacentBefore: {},
      identical: overlap,
      inside: overlap,
      covering: overlap,
      lastNightOverlap: overlap,
      firstNightOverlap: overlap,
      updateIntoNeighbour: overlap,
    });
  });

  it('rejects invalid rate period values with SQLSTATE 23514 and accepts the bounds', async () => {
    const outcomes = await inRolledBackTransaction(async (client) => ({
      emptyRange: await insertRatePeriod(client, '2032-01-10', '2032-01-10'),
      reversedRange: await insertRatePeriod(client, '2032-01-10', '2032-01-09'),
      longestRange: await insertRatePeriod(client, '2032-01-01', '2033-01-01'),
      tooLongRange: await insertRatePeriod(client, '2034-01-01', '2035-01-03'),
      zeroPrice: await insertRatePeriod(client, '2036-01-01', '2036-01-02', 0),
      belowMinimumPrice: await insertRatePeriod(client, '2036-01-01', '2036-01-02', 99),
      minimumPrice: await insertRatePeriod(client, '2036-01-01', '2036-01-02', 100),
      maximumPrice: await insertRatePeriod(client, '2036-01-02', '2036-01-03', 1_000_000),
      aboveMaximumPrice: await insertRatePeriod(client, '2036-01-03', '2036-01-04', 1_000_001),
      zeroMinimumNights: await insertRatePeriod(client, '2036-01-03', '2036-01-04', 8_000, 0),
      maximumMinimumNights: await insertRatePeriod(client, '2036-01-03', '2036-01-04', 8_000, 60),
      tooManyMinimumNights: await insertRatePeriod(client, '2036-01-04', '2036-01-05', 8_000, 61),
    }));

    const check = (constraint: string) => ({ code: '23514', constraint });
    expect(outcomes).toEqual({
      emptyRange: check('rate_periods_dates_check'),
      reversedRange: check('rate_periods_dates_check'),
      // 2032 is a leap year: 366 nights is the longest allowed period.
      longestRange: {},
      tooLongRange: check('rate_periods_length_check'),
      zeroPrice: check('rate_periods_price_check'),
      belowMinimumPrice: check('rate_periods_price_check'),
      minimumPrice: {},
      maximumPrice: {},
      aboveMaximumPrice: check('rate_periods_price_check'),
      zeroMinimumNights: check('rate_periods_minimum_nights_check'),
      maximumMinimumNights: {},
      tooManyMinimumNights: check('rate_periods_minimum_nights_check'),
    });
  });

  it('seeds the calendar sync singleton and refuses any second row', async () => {
    const outcomes = await inRolledBackTransaction(async (client) => ({
      rows: (await client.query(`
        SELECT id, cardinality(blocked_nights) AS blocked_nights, horizon_start, horizon_end,
               last_success_at, last_attempt_at, last_failure_at, last_error_code, last_http_status,
               consecutive_failures, lease_owner, lease_expires_at,
               next_attempt_at IS NOT NULL AS scheduled
        FROM calendar_sync_state
      `)).rows,
      duplicate: await attempt(client, `INSERT INTO calendar_sync_state (id) VALUES ('airbnb')`),
      otherSource: await attempt(client, `INSERT INTO calendar_sync_state (id) VALUES ('booking')`),
    }));

    expect(outcomes).toEqual({
      rows: [{
        id: 'airbnb',
        blocked_nights: 0,
        horizon_start: null,
        horizon_end: null,
        last_success_at: null,
        last_attempt_at: null,
        last_failure_at: null,
        last_error_code: null,
        last_http_status: null,
        consecutive_failures: 0,
        lease_owner: null,
        lease_expires_at: null,
        scheduled: true,
      }],
      duplicate: { code: '23505', constraint: 'calendar_sync_state_pkey' },
      otherSource: { code: '23514', constraint: 'calendar_sync_state_singleton_check' },
    });
  });

  it('enforces the calendar sync state invariants', async () => {
    const nights = (count: number) => `ARRAY(SELECT DATE '2031-01-01' + n FROM generate_series(0, ${count - 1}) AS n)`;
    const outcomes = await inRolledBackTransaction(async (client) => ({
      horizonStartOnly: await updateSyncState(client, `horizon_start = '2031-01-01', horizon_end = NULL`),
      horizonEndOnly: await updateSyncState(client, `horizon_start = NULL, horizon_end = '2031-01-01'`),
      emptyHorizon: await updateSyncState(client, `horizon_start = '2031-01-01', horizon_end = '2031-01-01'`),
      validHorizon: await updateSyncState(client, `horizon_start = '2031-01-01', horizon_end = '2032-01-01'`),
      maximumBlockedNights: await updateSyncState(client, `blocked_nights = ${nights(400)}`),
      tooManyBlockedNights: await updateSyncState(client, `blocked_nights = ${nights(401)}`),
      nullBlockedNights: await updateSyncState(client, `blocked_nights = NULL`),
      validErrorCode: await updateSyncState(client, `last_error_code = 'http_status'`),
      emptyErrorCode: await updateSyncState(client, `last_error_code = ''`),
      invalidErrorCode: await updateSyncState(client, `last_error_code = 'HTTP-500'`),
      validHttpStatus: await updateSyncState(client, `last_http_status = 503`),
      lowHttpStatus: await updateSyncState(client, `last_http_status = 99`),
      highHttpStatus: await updateSyncState(client, `last_http_status = 600`),
      negativeFailures: await updateSyncState(client, `consecutive_failures = -1`),
      leaseOwnerOnly: await updateSyncState(client, `lease_owner = 'worker-1', lease_expires_at = NULL`),
      leaseExpiryOnly: await updateSyncState(client, `lease_owner = NULL, lease_expires_at = now()`),
      validLease: await updateSyncState(client, `lease_owner = 'worker-1', lease_expires_at = now()`),
    }));

    const check = (constraint: string) => ({ code: '23514', constraint });
    expect(outcomes).toEqual({
      horizonStartOnly: check('calendar_sync_state_horizon_check'),
      horizonEndOnly: check('calendar_sync_state_horizon_check'),
      emptyHorizon: check('calendar_sync_state_horizon_check'),
      validHorizon: {},
      maximumBlockedNights: {},
      tooManyBlockedNights: check('calendar_sync_state_blocked_nights_check'),
      // cardinality(NULL) is NULL, which satisfies the CHECK, so only the
      // migration's NOT NULL (absent from Prisma's DDL) keeps the cap sound.
      // PostgreSQL names no constraint for a not-null violation.
      nullBlockedNights: { code: '23502', constraint: undefined },
      validErrorCode: {},
      emptyErrorCode: check('calendar_sync_state_last_error_code_check'),
      invalidErrorCode: check('calendar_sync_state_last_error_code_check'),
      validHttpStatus: {},
      lowHttpStatus: check('calendar_sync_state_last_http_status_check'),
      highHttpStatus: check('calendar_sync_state_last_http_status_check'),
      negativeFailures: check('calendar_sync_state_consecutive_failures_check'),
      leaseOwnerOnly: check('calendar_sync_state_lease_check'),
      leaseExpiryOnly: check('calendar_sync_state_lease_check'),
      validLease: {},
    });
  });

  // Pins the error shape the admin rate-period API maps to 409: adapter-pg has
  // no dedicated kind for 23P01, so Prisma reports its generic P2039 and keeps
  // the SQLSTATE on the driver adapter error in `meta`.
  it('surfaces an overlap through Prisma and adapter-pg as P2039 carrying SQLSTATE 23P01', async () => {
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      const ids = [randomUUID(), randomUUID()];
      try {
        await prisma.ratePeriod.create({
          data: {
            id: ids[0],
            startDate: utcMidnight('2040-05-01'),
            endDate: utcMidnight('2040-06-01'),
            nightlyPriceCents: 9_000,
          },
        });
        await prisma.ratePeriod.create({
          data: {
            id: ids[1],
            startDate: utcMidnight('2040-06-01'),
            endDate: utcMidnight('2040-07-01'),
            nightlyPriceCents: 9_500,
          },
        });

        const failures = [
          await prisma.ratePeriod.create({
            data: {
              id: randomUUID(),
              startDate: utcMidnight('2040-05-15'),
              endDate: utcMidnight('2040-05-20'),
              nightlyPriceCents: 9_000,
            },
          }).then(() => undefined, (error: unknown) => error),
          await prisma.ratePeriod.update({
            where: { id: ids[1] },
            data: { startDate: utcMidnight('2040-05-31') },
          }).then(() => undefined, (error: unknown) => error),
        ];

        for (const failure of failures) {
          expect(failure).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
          const known = failure as Prisma.PrismaClientKnownRequestError;
          expect(known.code).toBe('P2039');
          expect(known.meta?.driverAdapterError).toMatchObject({
            cause: {
              kind: 'postgres',
              code: '23P01',
              originalCode: '23P01',
              originalMessage: expect.stringContaining('"rate_periods_no_overlap"'),
            },
          });
        }
        await expect(prisma.ratePeriod.count()).resolves.toBe(2);
      } finally {
        await prisma.ratePeriod.deleteMany({ where: { id: { in: ids } } });
      }
    });
  });

  it('round-trips the blocked nights DATE[] through Prisma as UTC-midnight dates', async () => {
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      const seeded = await prisma.calendarSyncState.findUniqueOrThrow({ where: { id: 'airbnb' } });
      expect(seeded.blockedNights).toEqual([]);

      try {
        const nights = ['2031-02-28', '2031-03-01', '2032-02-29'];
        await prisma.calendarSyncState.update({
          where: { id: 'airbnb' },
          data: { blockedNights: nights.map(utcMidnight) },
        });

        const stored = await prisma.calendarSyncState.findUniqueOrThrow({ where: { id: 'airbnb' } });
        expect(stored.blockedNights.map((night) => night.toISOString()))
          .toEqual(nights.map((night) => `${night}T00:00:00.000Z`));
        await expect(prisma.$queryRaw`SELECT blocked_nights::text AS nights FROM calendar_sync_state`)
          .resolves.toEqual([{ nights: '{2031-02-28,2031-03-01,2032-02-29}' }]);
      } finally {
        await prisma.calendarSyncState.update({ where: { id: 'airbnb' }, data: { blockedNights: [] } });
      }
    });
  });
});
