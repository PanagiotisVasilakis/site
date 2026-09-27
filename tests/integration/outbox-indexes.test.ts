import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DisposableDatabaseTarget } from './support/database-safety';
import { createIsolatedDatabase, dropIsolatedDatabase } from './support/database-lifecycle';
import { withTestPrismaClient } from './support/fixtures';
import { applyMigrationsFromEmpty } from './support/migrations';
import { readDisposablePostgresRuntime } from './support/runtime';

const runtime = readDisposablePostgresRuntime();
let target: DisposableDatabaseTarget | undefined;

describe('outbox event indexes after the full migration chain', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'outbox_indexes');
    await applyMigrationsFromEmpty(target);
  });

  afterAll(async () => {
    if (target) await dropIsolatedDatabase(target);
    target = undefined;
  });

  it('indexes outbox events by stay request and by check-in request', async () => {
    const indexes = await withTestPrismaClient(target!, (prisma) => prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'outbox_events'
        AND indexname IN ('idx_outbox_events_stay_request', 'idx_outbox_events_check_in_request')
      ORDER BY indexname
    `);

    expect(indexes).toEqual([
      { indexname: 'idx_outbox_events_check_in_request', indexdef: expect.stringContaining('(check_in_request_id)') },
      { indexname: 'idx_outbox_events_stay_request', indexdef: expect.stringContaining('(stay_request_id)') },
    ]);
  });
});
