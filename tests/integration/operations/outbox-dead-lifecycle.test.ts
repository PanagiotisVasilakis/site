import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';

import type { DisposableDatabaseTarget } from '../support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { withTestPrismaClient } from '../support/fixtures';
import { applyMigrationsFromEmpty } from '../support/migrations';
import { readDisposablePostgresRuntime } from '../support/runtime';

const runtime = readDisposablePostgresRuntime();
const managedEnvironment = [
  'ALERT_WEBHOOK_REQUIRED',
  'ALERT_WEBHOOK_URL',
  'DATABASE_URL',
  'LOG_CONSOLE',
  'PRISMA_AUTO_DISCONNECT',
] as const;
type ManagedEnvironmentName = typeof managedEnvironment[number];

const id = (n: number) => `74000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ERASED = 1;
const FAILED_RECENTLY = 2;
const FAILED_LONG_AGO = 3;
const DELIVERED_LONG_AGO = 4;

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Outbox lifecycle database was not initialized.');
  return target;
}

async function seedEvent(n: number, status: 'DEAD' | 'DELIVERED', payload: string, updatedDaysAgo: number) {
  await withTestPrismaClient(requireTarget(), async (prisma) => {
    await prisma.$executeRaw`
      INSERT INTO outbox_events (
        id, event_type, destination, aggregate_type, aggregate_id, idempotency_key, payload,
        status, attempt_count, delivered_at, created_at, updated_at
      ) VALUES (
        ${id(n)}::uuid, 'check_in_time_request.created', 'checkin_request_webhook', 'check_in_request', ${id(n)},
        ${`dead-lifecycle:${n}`}, ${payload}::jsonb, ${status}::"OutboxStatus", 8,
        ${status === 'DELIVERED' ? new Date(Date.now() - updatedDaysAgo * 86_400_000) : null},
        now() - make_interval(days => ${updatedDaysAgo}), now() - make_interval(days => ${updatedDaysAgo})
      )
    `;
  }, 'seed');
}

async function remainingEventIds(): Promise<string[]> {
  return withTestPrismaClient(requireTarget(), async (prisma) => (
    (await prisma.outboxEvent.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).map((event) => event.id)
  ));
}

async function openDeadOutboxAlert() {
  return withTestPrismaClient(requireTarget(), async (prisma) => prisma.alert.findFirst({
    where: { rule: { name: 'Dead outbox events' }, status: 'OPEN' },
    select: { value: true },
  }));
}

describe.sequential('DEAD outbox event lifecycle on PostgreSQL', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'outbox_dead_lifecycle');
    await applyMigrationsFromEmpty(target);
    for (const name of managedEnvironment) originalEnvironment.set(name, process.env[name]);
    delete process.env.ALERT_WEBHOOK_URL;
    delete process.env.ALERT_WEBHOOK_REQUIRED;
    process.env.DATABASE_URL = target.databaseUrl;
    process.env.LOG_CONSOLE = 'false';
    process.env.PRISMA_AUTO_DISCONNECT = 'false';
    applicationPrisma = (await import('@/lib/prisma')).prisma;
  });

  afterEach(async () => {
    if (target) {
      await withTestPrismaClient(requireTarget(), async (prisma) => {
        await prisma.$transaction([
          prisma.alert.deleteMany(),
          prisma.alertRule.deleteMany(),
          prisma.outboxEvent.deleteMany(),
        ]);
      }, 'cleanup');
    }
  });

  afterAll(async () => {
    try {
      await applicationPrisma?.$disconnect();
      applicationPrisma = undefined;
    } finally {
      for (const name of managedEnvironment) {
        const value = originalEnvironment.get(name);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (target) await dropIsolatedDatabase(target);
      target = undefined;
    }
  });

  it('does not open the critical alert for events cancelled by a privacy erasure', async () => {
    await seedEvent(ERASED, 'DEAD', '{"redacted": true, "reason": "privacy_erasure"}', 0);
    const { evaluateOperationalAlerts } = await import('@/lib/operationalMonitor');

    await evaluateOperationalAlerts();

    expect(await openDeadOutboxAlert()).toBeNull();
  });

  it('counts only real delivery failures', async () => {
    await seedEvent(ERASED, 'DEAD', '{"redacted": true, "reason": "privacy_erasure"}', 0);
    await seedEvent(FAILED_RECENTLY, 'DEAD', '{"requestId": "a"}', 1);
    await seedEvent(FAILED_LONG_AGO, 'DEAD', '{"requestId": "b", "redacted": false}', 40);
    const { evaluateOperationalAlerts } = await import('@/lib/operationalMonitor');

    await evaluateOperationalAlerts();

    expect(await openDeadOutboxAlert()).toEqual({ value: 2 });
  });

  it('removes erasure-cancelled events at once and failed ones after 30 days, then resolves the alert', async () => {
    await seedEvent(ERASED, 'DEAD', '{"redacted": true, "reason": "privacy_erasure"}', 0);
    await seedEvent(FAILED_RECENTLY, 'DEAD', '{"requestId": "a"}', 1);
    await seedEvent(FAILED_LONG_AGO, 'DEAD', '{"requestId": "b"}', 40);
    await seedEvent(DELIVERED_LONG_AGO, 'DELIVERED', '{"requestId": "c"}', 40);
    const { evaluateOperationalAlerts, runRetention } = await import('@/lib/operationalMonitor');

    const retention = await runRetention();

    expect(retention).toMatchObject({ outbox: 1, deadOutbox: 2 });
    expect(await remainingEventIds()).toEqual([id(FAILED_RECENTLY)]);

    await evaluateOperationalAlerts();
    expect(await openDeadOutboxAlert()).toEqual({ value: 1 });
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      await prisma.outboxEvent.deleteMany({ where: { id: id(FAILED_RECENTLY) } });
    }, 'cleanup');
    const next = await evaluateOperationalAlerts();
    expect(next.resolved).toBe(1);
    expect(await openDeadOutboxAlert()).toBeNull();
  });
});
