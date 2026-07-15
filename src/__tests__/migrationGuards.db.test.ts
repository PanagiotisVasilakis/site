import { readFileSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';

describe('destructive migration guards (database)', () => {
  it('aborts and rolls back when a retired legacy table still contains data', async () => {
    const migration = readFileSync(
      path.resolve('prisma/migrations/20260715110000_remove_unused_legacy_models/migration.sql'),
      'utf8',
    );
    const guardStart = migration.indexOf('DO $$');
    const guardEnd = migration.indexOf('END $$;', guardStart) + 'END $$;'.length;
    const guardSql = migration.slice(guardStart, guardEnd);

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('CREATE TABLE "cache" ("id" TEXT PRIMARY KEY)');
      await tx.$executeRawUnsafe('INSERT INTO "cache" ("id") VALUES (\'retained-row\')');
      await tx.$executeRawUnsafe(guardSql);
    })).rejects.toThrow(/Refusing to remove non-empty legacy table cache/);

    const [result] = await prisma.$queryRaw<Array<{ table_name: string | null }>>`
      SELECT to_regclass('public.cache')::text AS table_name
    `;
    expect(result.table_name).toBeNull();
  });
});
