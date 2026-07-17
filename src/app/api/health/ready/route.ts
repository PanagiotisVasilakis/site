import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// This must be updated whenever a schema migration is added. Readiness is not
// merely a TCP/SELECT probe: the running binary and database schema must agree.
const EXPECTED_MIGRATION = '20260715110000_remove_unused_legacy_models';
const READINESS_CACHE_MS = 2_000;
let cachedReadiness: { ready: boolean; expiresAt: number } | null = null;
let readinessInFlight: Promise<boolean> | null = null;

async function databaseReady(): Promise<boolean> {
  try {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '1800ms'");
      await tx.$queryRaw`SELECT 1`;
      return tx.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name
        FROM _prisma_migrations
        WHERE migration_name = ${EXPECTED_MIGRATION}
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
        LIMIT 1
      `;
    }, { timeout: 2_500 });

    return rows.length === 1;
  } catch {
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
