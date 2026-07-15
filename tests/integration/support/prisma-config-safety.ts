import {
  assertStaticDatabaseSafety,
  databaseTarget,
} from './database-safety';
import { readDisposablePostgresRuntime } from './runtime';

export function guardedPrismaDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const databaseUrl = env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('The integration Prisma config requires a guarded test database target.');
  }

  let database: string;
  try {
    const url = new URL(databaseUrl);
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('The integration Prisma config rejected an unsafe database target.');
  }

  const runtime = readDisposablePostgresRuntime(env);
  const target = databaseTarget(runtime, database);
  if (databaseUrl !== target.databaseUrl) {
    throw new Error('The integration Prisma config rejected an unsafe database target.');
  }
  assertStaticDatabaseSafety(target);
  return target.databaseUrl;
}
