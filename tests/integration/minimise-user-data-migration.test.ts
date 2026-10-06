import { readFile } from 'node:fs/promises';
import type { Client as PgClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DisposableDatabaseTarget } from './support/database-safety';
import { withVerifiedDisposableDatabase } from './support/database-safety';
import { createIsolatedDatabase, dropIsolatedDatabase } from './support/database-lifecycle';
import { applyMigrationsFromEmpty } from './support/migrations';
import { readDisposablePostgresRuntime } from './support/runtime';

const MIGRATION = '20260930120000_minimise_user_data';
// The integration runner starts Vitest with the repository root as cwd.
const MIGRATION_FILE = `prisma/migrations/${MIGRATION}/migration.sql`;
const ORIGIN_REFUSAL = 'Refusing to remove users.country_origin while users still hold a value';
const EMAIL_REFUSAL = 'Refusing to remove users.email while users still hold an address';

const USER_ID = '77000000-0000-4000-8000-000000000001';

const runtime = readDisposablePostgresRuntime();
let target: DisposableDatabaseTarget | undefined;

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('User data minimisation database was not initialized.');
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
  const { rows } = await client.query<{ columns: string[]; origin_index: string | null; email_index: string | null; origin_type: string | null }>(`
    SELECT
      ARRAY(
        SELECT column_name::text FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('country_origin', 'email')
        ORDER BY column_name
      ) AS columns,
      to_regclass('public.idx_users_country_origin')::text AS origin_index,
      to_regclass('public.users_email_key')::text AS email_index,
      to_regtype('public."CountryOrigin"')::text AS origin_type
  `);
  return rows[0];
}

const NOTHING_LEFT = { columns: [], origin_index: null, email_index: null, origin_type: null };

// Re-creates the pre-migration shape of the two columns as 000_init defined them.
const ADD_COLUMNS = `CREATE TYPE "CountryOrigin" AS ENUM ('GR', 'ABROAD');
  ALTER TABLE users ADD COLUMN country_origin "CountryOrigin";
  CREATE INDEX idx_users_country_origin ON users (country_origin);
  ALTER TABLE users ADD COLUMN email TEXT;
  CREATE UNIQUE INDEX users_email_key ON users (email);`;
const RESTORE = `DELETE FROM users WHERE id = '${USER_ID}';
  DROP INDEX IF EXISTS idx_users_country_origin;
  ALTER TABLE users DROP COLUMN IF EXISTS country_origin;
  DROP TYPE IF EXISTS "CountryOrigin";
  DROP INDEX IF EXISTS users_email_key;
  ALTER TABLE users DROP COLUMN IF EXISTS email;`;

function insertUser(origin: string, email: string): string {
  return `
    INSERT INTO users (id, phone_e164, updated_at, country_origin, email)
    VALUES ('${USER_ID}', '+12025550777', now(), ${origin}, ${email})
  `;
}

describe('minimise_user_data migration', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'minimise_user_data');
    await applyMigrationsFromEmpty(target);
  });

  afterAll(async () => {
    if (target) await dropIsolatedDatabase(target);
    target = undefined;
  });

  it('removes both columns, their indexes and the enum at the end of the full chain', async () => {
    await withVerifiedDisposableDatabase(requireTarget(), 'verification', async (client) => {
      const applied = await client.query<{ finished: boolean; rolled_back: boolean }>(
        `SELECT finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
         FROM _prisma_migrations WHERE migration_name = $1`,
        [MIGRATION],
      );

      expect(applied.rows).toEqual([{ finished: true, rolled_back: false }]);
      expect(await removedObjects(client)).toEqual(NOTHING_LEFT);
    });
  });

  it('refuses while a user still holds a country origin and leaves the user intact', async () => {
    await withScenario(`${ADD_COLUMNS} ${insertUser(`'GR'`, 'NULL')};`, RESTORE, async (client) => {
      await expect(runMigrationFile(client)).rejects.toMatchObject({ code: 'P0001', message: ORIGIN_REFUSAL });

      const { rows } = await client.query<{ country_origin: string | null }>(
        'SELECT country_origin::text FROM users WHERE id = $1',
        [USER_ID],
      );
      expect(rows).toEqual([{ country_origin: 'GR' }]);
      expect((await removedObjects(client)).columns).toEqual(['country_origin', 'email']);
    });
  });

  it('refuses while a user still holds an email address and leaves the user intact', async () => {
    await withScenario(`${ADD_COLUMNS} ${insertUser('NULL', `'legacy@example.invalid'`)};`, RESTORE, async (client) => {
      await expect(runMigrationFile(client)).rejects.toMatchObject({ code: 'P0001', message: EMAIL_REFUSAL });

      const { rows } = await client.query<{ email: string | null }>('SELECT email FROM users WHERE id = $1', [USER_ID]);
      expect(rows).toEqual([{ email: 'legacy@example.invalid' }]);
      expect((await removedObjects(client)).columns).toEqual(['country_origin', 'email']);
    });
  });

  it('drops leftover columns when no user holds a value and keeps the user', async () => {
    await withScenario(`${ADD_COLUMNS} ${insertUser('NULL', 'NULL')};`, RESTORE, async (client) => {
      await expect(runMigrationFile(client)).resolves.toBeUndefined();

      expect(await removedObjects(client)).toEqual(NOTHING_LEFT);
      const { rows } = await client.query<{ phone_e164: string }>('SELECT phone_e164 FROM users WHERE id = $1', [USER_ID]);
      expect(rows).toEqual([{ phone_e164: '+12025550777' }]);
    });
  });

  it('drops leftover columns on an empty users table', async () => {
    await withScenario(ADD_COLUMNS, RESTORE, async (client) => {
      await expect(runMigrationFile(client)).resolves.toBeUndefined();

      expect(await removedObjects(client)).toEqual(NOTHING_LEFT);
    });
  });

  it('re-runs cleanly on the migrated database and changes nothing', async () => {
    await withVerifiedDisposableDatabase(requireTarget(), 'migration', async (client) => {
      await expect(runMigrationFile(client)).resolves.toBeUndefined();
      await expect(runMigrationFile(client)).resolves.toBeUndefined();

      expect(await removedObjects(client)).toEqual(NOTHING_LEFT);
    });
  });
});
