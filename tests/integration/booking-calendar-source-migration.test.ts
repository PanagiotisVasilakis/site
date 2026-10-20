import type { Client as PgClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DisposableDatabaseTarget } from './support/database-safety';
import { withVerifiedDisposableDatabase } from './support/database-safety';
import { createIsolatedDatabase, dropIsolatedDatabase } from './support/database-lifecycle';
import { applyMigrationsFromEmpty, runMigrationFile, withScenario } from './support/migrations';
import { readDisposablePostgresRuntime } from './support/runtime';

const MIGRATION = '20261020120000_booking_calendar_source';
// The id of the retired calendar source, which the migration re-keys: this file is a history record of that.
const RETIRED_ID = 'airbnb';

const runtime = readDisposablePostgresRuntime();
let target: DisposableDatabaseTarget | undefined;

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Booking calendar source database was not initialized.');
  return target;
}

// Every column the migration resets. The three timestamps that a fresh row sets to the current time are
// read as 'recent' (within the last day by the database clock), which a legacy value from years ago or
// from the future is not.
type SyncRow = {
  id: string;
  blocked_nights: number;
  horizon_start: Date | null;
  horizon_end: Date | null;
  last_success_at: Date | null;
  last_attempt_at: Date | null;
  last_failure_at: Date | null;
  last_error_code: string | null;
  last_http_status: number | null;
  consecutive_failures: number;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  next_attempt_at_recent: boolean;
  created_at_recent: boolean;
  updated_at_recent: boolean;
};

async function syncRows(client: PgClient): Promise<SyncRow[]> {
  const { rows } = await client.query<SyncRow>(`
    SELECT id, cardinality(blocked_nights) AS blocked_nights, horizon_start, horizon_end, last_success_at,
      last_attempt_at, last_failure_at, last_error_code, last_http_status, consecutive_failures, lease_owner,
      lease_expires_at,
      next_attempt_at BETWEEN now() - interval '1 day' AND now() AS next_attempt_at_recent,
      created_at BETWEEN now() - interval '1 day' AND now() AS created_at_recent,
      updated_at BETWEEN now() - interval '1 day' AND now() AS updated_at_recent
    FROM calendar_sync_state ORDER BY id
  `);
  return rows;
}

// A freshly seeded row: only the id is inserted, every other column takes its default.
const EMPTY_BOOKING_ROW: SyncRow = {
  id: 'booking',
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
  next_attempt_at_recent: true,
  created_at_recent: true,
  updated_at_recent: true,
};

const CLEAR = `
  ALTER TABLE calendar_sync_state DROP CONSTRAINT IF EXISTS calendar_sync_state_singleton_check;
  DELETE FROM calendar_sync_state;`;
const singleton = (id: string) => `ALTER TABLE calendar_sync_state ADD CONSTRAINT calendar_sync_state_singleton_check CHECK (id = '${id}');`;

// What the previous migration leaves: one row of the retired source, holding a snapshot in every column
// that the migration resets (a failure history, a held lease, timestamps of an older release).
const LEGACY_STATE = `${CLEAR}
  INSERT INTO calendar_sync_state (id, blocked_nights, horizon_start, horizon_end, last_success_at, last_attempt_at,
    next_attempt_at, last_failure_at, last_error_code, last_http_status, consecutive_failures, lease_owner,
    lease_expires_at, created_at, updated_at)
  VALUES ('${RETIRED_ID}', ARRAY[DATE '2031-01-01', DATE '2031-01-02'], DATE '2031-01-01', DATE '2032-01-01', now(), now(),
    now() + interval '7 days', now(), 'http_status', 503, 2, 'legacy-worker',
    now() + interval '1 minute', TIMESTAMPTZ '2020-01-01 00:00:00+00', TIMESTAMPTZ '2020-01-01 00:00:00+00');
  ${singleton(RETIRED_ID)}`;
// What the full chain leaves; every scenario ends here.
const MIGRATED_STATE = `${CLEAR}
  INSERT INTO calendar_sync_state (id) VALUES ('booking');
  ${singleton('booking')}`;

// Ambiguous states the migration must refuse: [label, rows, refusal message, ids left behind].
const REFUSALS: Array<[string, string, string, string[]]> = [
  ['a row with another id', `('${RETIRED_ID}'), ('other')`, 'Refusing to re-key calendar_sync_state: a row has an id other than airbnb or booking', [RETIRED_ID, 'other']],
  ['both the retired row and the booking row', `('${RETIRED_ID}'), ('booking')`, 'Refusing to re-key calendar_sync_state: both the airbnb row and the booking row exist', [RETIRED_ID, 'booking']],
];

describe('booking_calendar_source migration', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'booking_calendar_source');
    await applyMigrationsFromEmpty(target);
  });

  afterAll(async () => {
    if (target) await dropIsolatedDatabase(target);
    target = undefined;
  });

  it('re-keys the retired row to an empty booking row and does not carry its snapshot over', async () => {
    await withScenario(requireTarget(), LEGACY_STATE, MIGRATED_STATE, async (client) => {
      expect(await syncRows(client)).toMatchObject([{
        id: RETIRED_ID,
        blocked_nights: 2,
        consecutive_failures: 2,
        last_error_code: 'http_status',
        lease_owner: 'legacy-worker',
        next_attempt_at_recent: false,
        created_at_recent: false,
        updated_at_recent: false,
      }]);

      await expect(runMigrationFile(client, MIGRATION)).resolves.toBeUndefined();

      expect(await syncRows(client)).toEqual([EMPTY_BOOKING_ROW]);
    });
  });

  it.each(REFUSALS)('refuses %s and leaves every row as it was', async (_label, rows, message, ids) => {
    await withScenario(requireTarget(), `${CLEAR} INSERT INTO calendar_sync_state (id) VALUES ${rows};`, MIGRATED_STATE, async (client) => {
      await expect(runMigrationFile(client, MIGRATION)).rejects.toMatchObject({ code: 'P0001', message });

      expect((await syncRows(client)).map((row) => row.id)).toEqual(ids);
    });
  });

  it('re-seeds one empty booking row when the table is empty', async () => {
    await withScenario(requireTarget(), CLEAR, MIGRATED_STATE, async (client) => {
      expect(await syncRows(client)).toEqual([]);

      await expect(runMigrationFile(client, MIGRATION)).resolves.toBeUndefined();

      expect(await syncRows(client)).toEqual([EMPTY_BOOKING_ROW]);
    });
  });

  it('re-runs cleanly on the migrated database and changes nothing', async () => {
    await withVerifiedDisposableDatabase(requireTarget(), 'migration', async (client) => {
      await expect(runMigrationFile(client, MIGRATION)).resolves.toBeUndefined();
      await expect(runMigrationFile(client, MIGRATION)).resolves.toBeUndefined();

      expect(await syncRows(client)).toEqual([EMPTY_BOOKING_ROW]);
    });
  });
});
