import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger-enterprise';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// This must name the newest schema migration (tests/unit/readiness-migration.test.ts
// enforces it). Readiness is not merely a TCP/SELECT probe: the running binary
// and database schema must agree, so the newest finished migration in the database
// has to be exactly this one. A database that is behind (migrate has not run yet) and
// one that is ahead (an older image started after a later release migrated) are both
// not ready.
const EXPECTED_MIGRATION = '20260930120000_minimise_user_data';
const READINESS_CACHE_MS = 2_000;
let cachedReadiness: { ready: boolean; expiresAt: number } | null = null;
let readinessInFlight: Promise<boolean> | null = null;

async function databaseReady(): Promise<boolean> {
  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '1800ms'");
      await tx.$queryRaw`SELECT 1`;
      // Byte order ("C"), so the database locale cannot change which migration is the newest.
      return tx.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
          AND rolled_back_at IS NULL
        ORDER BY migration_name COLLATE "C" DESC
        LIMIT 1
      `;
    }, { timeout: 2_500 });

    const newest: string | undefined = rows[0]?.migration_name;
    if (newest === EXPECTED_MIGRATION) return true;

    // Behind: run the migrate service. Ahead: start the image that matches the database.
    // Migration names start with a timestamp, so string order is the "C" order of the query.
    const metadata = { expectedMigration: EXPECTED_MIGRATION, newestAppliedMigration: newest ?? null };
    if (newest !== undefined && newest > EXPECTED_MIGRATION) {
      logger.warn('Readiness: database schema is newer than this image', metadata);
    } else {
      logger.warn('Readiness: expected migration is not applied', metadata);
    }
    return false;
  } catch (error) {
    // Only the error name: the message can carry connection details.
    logger.warn('Readiness: database check failed', { errorName: error instanceof Error ? error.name : 'unknown' });
    return false;
  }
}

async function checkReadiness(): Promise<boolean> {
  return databaseReady();
}

async function getReadiness(): Promise<boolean> {
  const now = Date.now();
  if (cachedReadiness && cachedReadiness.expiresAt > now) return cachedReadiness.ready;
  if (readinessInFlight) return readinessInFlight;

  readinessInFlight = checkReadiness().then((ready) => {
    cachedReadiness = { ready, expiresAt: Date.now() + READINESS_CACHE_MS };
    return ready;
  }).finally(() => {
    readinessInFlight = null;
  });
  return readinessInFlight;
}

async function readinessResponse(head = false) {
  // Coalesce concurrent probes and briefly cache the dependency result. This
  // bounds public request amplification while retaining a much shorter window
  // than the container's 30-second probe interval.
  const ready = await getReadiness();
  const init = {
    status: ready ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  };
  return head
    ? new Response(null, init)
    : NextResponse.json({ status: ready ? 'ready' : 'not_ready' }, init);
}

export function GET() {
  return readinessResponse();
}

export function HEAD() {
  return readinessResponse(true);
}
