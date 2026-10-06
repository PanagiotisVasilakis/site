import { readFile } from 'node:fs/promises';
import type { Client as PgClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DisposableDatabaseTarget } from './support/database-safety';
import { withVerifiedDisposableDatabase } from './support/database-safety';
import { createIsolatedDatabase, dropIsolatedDatabase } from './support/database-lifecycle';
import { applyMigrationsFromEmpty } from './support/migrations';
import { readDisposablePostgresRuntime } from './support/runtime';

const MIGRATION = '20260929120000_drop_bookings_reference';
// The integration runner starts Vitest with the repository root as cwd.
const MIGRATION_FILE = `prisma/migrations/${MIGRATION}/migration.sql`;
const REFUSAL = 'Refusing to remove bookings.reference while bookings still hold a reference';

const BOOKING_ID = '76000000-0000-4000-8000-000000000001';

const runtime = readDisposablePostgresRuntime();
let target: DisposableDatabaseTarget | undefined;

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Booking reference removal database was not initialized.');
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

async function referenceColumn(client: PgClient) {
  const { rows } = await client.query<{ column_name: string }>(`
    SELECT column_name::text FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'reference'
  `);
  return rows;
}

async function referenceIndex(client: PgClient): Promise<string | null> {
  const { rows } = await client.query<{ index_name: string | null }>(
    `SELECT to_regclass('public.idx_bookings_reference')::text AS index_name`,
  );
  return rows[0]?.index_name ?? null;
}

function insertBooking(reference: string): string {
  return `
    INSERT INTO bookings (id, source, start_date, end_date, provider, external_reference, updated_at, reference)
    VALUES ('${BOOKING_ID}', 'EXTERNAL', '2030-07-20', '2030-07-22', 'legacy', 'EXT-1', now(), ${reference})
  `;
}

const ADD_COLUMN = `ALTER TABLE bookings ADD COLUMN reference TEXT;
  CREATE INDEX idx_bookings_reference ON bookings (reference);`;
const RESTORE = `DELETE FROM bookings WHERE id = '${BOOKING_ID}';
  DROP INDEX IF EXISTS idx_bookings_reference;
  ALTER TABLE bookings DROP COLUMN IF EXISTS reference;`;

describe('drop_bookings_reference migration', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'drop_bookings_reference');
    await applyMigrationsFromEmpty(target);
  });

  afterAll(async () => {
    if (target) await dropIsolatedDatabase(target);
    target = undefined;
  });

  it('removes the column and its index at the end of the full chain', async () => {
    await withVerifiedDisposableDatabase(requireTarget(), 'verification', async (client) => {
      const applied = await client.query<{ finished: boolean; rolled_back: boolean }>(
        `SELECT finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
         FROM _prisma_migrations WHERE migration_name = $1`,
        [MIGRATION],
      );

      expect(applied.rows).toEqual([{ finished: true, rolled_back: false }]);
      expect(await referenceColumn(client)).toEqual([]);
      expect(await referenceIndex(client)).toBeNull();
    });
  });

  it('refuses to drop a reference column that still holds a value and leaves the booking intact', async () => {
    await withScenario(`${ADD_COLUMN} ${insertBooking(`'LEGACY-1'`)};`, RESTORE, async (client) => {
      await expect(runMigrationFile(client)).rejects.toMatchObject({ code: 'P0001', message: REFUSAL });

      const { rows } = await client.query<{ reference: string | null }>(
        'SELECT reference FROM bookings WHERE id = $1',
        [BOOKING_ID],
      );
      expect(rows).toEqual([{ reference: 'LEGACY-1' }]);
      expect(await referenceIndex(client)).toBe('idx_bookings_reference');
    });
  });

  it('drops a leftover reference column that holds only NULLs and keeps the booking', async () => {
    await withScenario(`${ADD_COLUMN} ${insertBooking('NULL')};`, RESTORE, async (client) => {
      await expect(runMigrationFile(client)).resolves.toBeUndefined();

      expect(await referenceColumn(client)).toEqual([]);
      expect(await referenceIndex(client)).toBeNull();
      const { rows } = await client.query<{ external_reference: string | null }>(
        'SELECT external_reference FROM bookings WHERE id = $1',
        [BOOKING_ID],
      );
      expect(rows).toEqual([{ external_reference: 'EXT-1' }]);
    });
  });

  it('re-runs cleanly on the migrated database and changes nothing', async () => {
    await withVerifiedDisposableDatabase(requireTarget(), 'migration', async (client) => {
      await expect(runMigrationFile(client)).resolves.toBeUndefined();
      await expect(runMigrationFile(client)).resolves.toBeUndefined();

      expect(await referenceColumn(client)).toEqual([]);
      expect(await referenceIndex(client)).toBeNull();
    });
  });
});
