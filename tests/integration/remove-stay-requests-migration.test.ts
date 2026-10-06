import { readFile } from 'node:fs/promises';
import type { Client as PgClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DisposableDatabaseTarget } from './support/database-safety';
import { withVerifiedDisposableDatabase } from './support/database-safety';
import { createIsolatedDatabase, dropIsolatedDatabase } from './support/database-lifecycle';
import { applyMigrationsFromEmpty } from './support/migrations';
import { readDisposablePostgresRuntime } from './support/runtime';

const MIGRATION = '20260928215800_remove_stay_requests';
// The integration runner starts Vitest with the repository root as cwd.
const MIGRATION_FILE = `prisma/migrations/${MIGRATION}/migration.sql`;
const TABLE_REFUSAL = 'Refusing to remove non-empty table stay_requests';
const COLUMN_REFUSAL = 'Refusing to remove outbox_events.stay_request_id while events still reference stay requests';
const EVENT_REFUSAL = 'Refusing to remove stay requests while booking-request outbox events remain';

const STAY_ID = '75000000-0000-4000-8000-000000000001';
const EVENT_ID = '75000000-0000-4000-8000-000000000002';

const runtime = readDisposablePostgresRuntime();
let target: DisposableDatabaseTarget | undefined;

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Stay-request removal database was not initialized.');
  return target;
}

// Sent as one simple-protocol query, so PostgreSQL runs the whole file as one
// implicit transaction (the behaviour the migration's header relies on).
async function runMigrationFile(client: PgClient): Promise<void> {
  const sql = await readFile(MIGRATION_FILE, 'utf8');
  await client.query(sql);
}

// A scenario changes the migrated database only in `arrange` and always undoes
// it in `restore`, so every test starts from the state the full chain leaves.
function withScenario<T>(arrange: string, restore: string, action: (client: PgClient) => Promise<T>): Promise<T> {
  return withVerifiedDisposableDatabase(requireTarget(), 'migration', async (client) => {
    try {
      await client.query(arrange);
      return await action(client);
    } finally {
      await client.query(restore);
    }
  });
}

async function removedObjects(client: PgClient) {
  const { rows } = await client.query<{ table_name: string | null; trigger_function: string | null; status_type: string | null }>(`
    SELECT to_regclass('public.stay_requests')::text AS table_name,
      to_regprocedure('enforce_stay_requests_phone_e164()')::text AS trigger_function,
      to_regtype('"StayRequestStatus"')::text AS status_type
  `);
  return rows[0];
}

async function outboxLinks(client: PgClient) {
  const { rows } = await client.query<{ conname: string }>(`
    SELECT conname::text FROM pg_constraint
    WHERE conrelid = 'public.outbox_events'::regclass AND contype = 'f'
    ORDER BY conname
  `);
  return rows.map((row) => row.conname);
}

function insertEvent(destination: string, aggregateType: string, status: string, extraColumn = ''): string {
  return `
    INSERT INTO outbox_events (
      id, event_type, destination, aggregate_type, aggregate_id, idempotency_key, payload, status${extraColumn ? ', stay_request_id' : ''}
    ) VALUES (
      '${EVENT_ID}', 'leftover.event', '${destination}', '${aggregateType}', '${STAY_ID}',
      'remove-stay-requests:${EVENT_ID}', '{}'::jsonb, '${status}'::"OutboxStatus"${extraColumn ? `, ${extraColumn}` : ''}
    )
  `;
}

async function eventRow(client: PgClient) {
  const { rows } = await client.query<{ destination: string; aggregate_type: string; status: string }>(
    'SELECT destination, aggregate_type, status::text FROM outbox_events WHERE id = $1',
    [EVENT_ID],
  );
  return rows;
}

describe('remove_stay_requests migration', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'remove_stay_requests');
    await applyMigrationsFromEmpty(target);
  });

  afterAll(async () => {
    if (target) await dropIsolatedDatabase(target);
    target = undefined;
  });

  it('removes the table, its trigger function, its enum and the outbox link at the end of the full chain', async () => {
    await withVerifiedDisposableDatabase(requireTarget(), 'verification', async (client) => {
      const applied = await client.query<{ finished: boolean; rolled_back: boolean }>(
        `SELECT finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
         FROM _prisma_migrations WHERE migration_name = $1`,
        [MIGRATION],
      );

      expect(applied.rows).toEqual([{ finished: true, rolled_back: false }]);
      expect(await removedObjects(client)).toEqual({ table_name: null, trigger_function: null, status_type: null });
      expect(await outboxLinks(client)).toEqual(['outbox_events_check_in_request_id_fkey']);
      const { rows: columns } = await client.query<{ column_name: string }>(`
        SELECT column_name::text FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'outbox_events'
          AND column_name IN ('stay_request_id', 'check_in_request_id')
        ORDER BY column_name
      `);
      expect(columns).toEqual([{ column_name: 'check_in_request_id' }]);
    });
  });

  it('refuses to drop a stay_requests table that still has a row and leaves it intact', async () => {
    await withScenario(
      `CREATE TABLE stay_requests (id UUID PRIMARY KEY);
       INSERT INTO stay_requests (id) VALUES ('${STAY_ID}');`,
      'DROP TABLE IF EXISTS stay_requests;',
      async (client) => {
        await expect(runMigrationFile(client)).rejects.toMatchObject({ code: 'P0001', message: TABLE_REFUSAL });

        const { rows } = await client.query<{ id: string }>('SELECT id::text FROM stay_requests');
        expect(rows).toEqual([{ id: STAY_ID }]);
      },
    );
  });

  it('drops an empty leftover stay_requests table', async () => {
    await withScenario(
      'CREATE TABLE stay_requests (id UUID PRIMARY KEY);',
      'DROP TABLE IF EXISTS stay_requests;',
      async (client) => {
        await expect(runMigrationFile(client)).resolves.toBeUndefined();
        expect((await removedObjects(client)).table_name).toBeNull();
      },
    );
  });

  it('refuses to drop a stay_request_id column that still holds a value and leaves the event intact', async () => {
    await withScenario(
      `ALTER TABLE outbox_events ADD COLUMN stay_request_id UUID;
       ${insertEvent('checkin_request_webhook', 'check_in_request', 'PENDING', `'${STAY_ID}'::uuid`)};`,
      `DELETE FROM outbox_events WHERE id = '${EVENT_ID}';
       ALTER TABLE outbox_events DROP COLUMN IF EXISTS stay_request_id;`,
      async (client) => {
        await expect(runMigrationFile(client)).rejects.toMatchObject({ code: 'P0001', message: COLUMN_REFUSAL });

        const { rows } = await client.query<{ stay_request_id: string | null }>(
          'SELECT stay_request_id::text FROM outbox_events WHERE id = $1',
          [EVENT_ID],
        );
        expect(rows).toEqual([{ stay_request_id: STAY_ID }]);
      },
    );
  });

  it('drops a leftover stay_request_id column that holds only NULLs and keeps the event', async () => {
    await withScenario(
      `ALTER TABLE outbox_events ADD COLUMN stay_request_id UUID;
       ${insertEvent('checkin_request_webhook', 'check_in_request', 'PENDING', 'NULL')};`,
      `DELETE FROM outbox_events WHERE id = '${EVENT_ID}';
       ALTER TABLE outbox_events DROP COLUMN IF EXISTS stay_request_id;`,
      async (client) => {
        await expect(runMigrationFile(client)).resolves.toBeUndefined();

        const { rows } = await client.query<{ column_name: string }>(`
          SELECT column_name::text FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'stay_request_id'
        `);
        expect(rows).toEqual([]);
        expect(await eventRow(client)).toEqual([
          { destination: 'checkin_request_webhook', aggregate_type: 'check_in_request', status: 'PENDING' },
        ]);
      },
    );
  });

  it.each([
    ['a pending booking-request event', 'booking_request_webhook', 'stay_request', 'PENDING'],
    ['a delivered event for the booking-request destination', 'booking_request_webhook', 'check_in_request', 'DELIVERED'],
    ['a dead event for a stay-request aggregate', 'checkin_request_webhook', 'stay_request', 'DEAD'],
  ])('refuses while the outbox holds %s and leaves the event intact', async (_label, destination, aggregateType, status) => {
    await withScenario(
      `${insertEvent(destination, aggregateType, status)};`,
      `DELETE FROM outbox_events WHERE id = '${EVENT_ID}';`,
      async (client) => {
        await expect(runMigrationFile(client)).rejects.toMatchObject({ code: 'P0001', message: EVENT_REFUSAL });
        expect(await eventRow(client)).toEqual([{ destination, aggregate_type: aggregateType, status }]);
      },
    );
  });

  it('re-runs cleanly on the migrated database and changes nothing', async () => {
    await withVerifiedDisposableDatabase(requireTarget(), 'migration', async (client) => {
      await expect(runMigrationFile(client)).resolves.toBeUndefined();
      await expect(runMigrationFile(client)).resolves.toBeUndefined();

      expect(await removedObjects(client)).toEqual({ table_name: null, trigger_function: null, status_type: null });
      expect(await outboxLinks(client)).toEqual(['outbox_events_check_in_request_id_fkey']);
      const { rows } = await client.query<{ indexname: string; indexdef: string }>(`
        SELECT indexname::text, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'outbox_events'
          AND (indexname IN ('idx_outbox_events_stay_request', 'idx_outbox_events_check_in_request')
            OR indexdef LIKE '%stay_request%')
        ORDER BY indexname
      `);
      expect(rows).toEqual([
        { indexname: 'idx_outbox_events_check_in_request', indexdef: expect.stringContaining('(check_in_request_id)') },
      ]);
    });
  });
});
