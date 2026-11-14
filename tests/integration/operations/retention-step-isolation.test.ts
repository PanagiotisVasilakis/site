import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
const managedEnvironment = ['DATABASE_URL'] as const;
type ManagedEnvironmentName = typeof managedEnvironment[number];

const id = (n: number) => `76000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const monthsAgo = (months: number) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
};

const EXPIRED_GUEST = 1;
const EXPIRED_BOOKING = 11;
const EXPIRED_CHECK_IN = 21;
// Check-in requests without a booking: one older and one younger than the 12 months, and one that was redacted already.
const OLD_BOOKINGLESS = 22;
const RECENT_BOOKINGLESS = 23;
const REDACTED_BOOKINGLESS = 24;

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Retention isolation database was not initialized.');
  return target;
}

async function seed() {
  await withTestPrismaClient(requireTarget(), async (prisma) => {
    await prisma.user.create({ data: { id: id(EXPIRED_GUEST), phoneE164: '+306900000001' } });
    await prisma.booking.create({
      data: {
        id: id(EXPIRED_BOOKING),
        source: 'EXTERNAL',
        provider: 'booking',
        externalReference: 'HM-ISOLATION-11',
        startDate: monthsAgo(14),
        endDate: monthsAgo(13),
        userId: id(EXPIRED_GUEST),
        accessStatus: 'VERIFIED',
        claimedAt: monthsAgo(14),
      },
    });
    const contact = (n: number) => ({
      guestName: 'Synthetic Guest',
      guestEmail: `guest${n}@example.test`,
      guestPhone: `+30690000000${n}`,
      requestedTime: '15:00',
      message: 'Synthetic message',
    });
    await prisma.checkInRequest.create({
      data: { id: id(EXPIRED_CHECK_IN), bookingId: id(EXPIRED_BOOKING), userId: id(EXPIRED_GUEST), ...contact(1) },
    });
    await prisma.checkInRequest.create({ data: { id: id(OLD_BOOKINGLESS), createdAt: monthsAgo(13), ...contact(2) } });
    await prisma.checkInRequest.create({ data: { id: id(RECENT_BOOKINGLESS), createdAt: monthsAgo(11), ...contact(3) } });
    await prisma.checkInRequest.create({
      data: {
        id: id(REDACTED_BOOKINGLESS),
        createdAt: monthsAgo(14),
        requestedTime: '16:00',
        guestName: null,
        guestEmail: null,
        guestPhone: null,
        message: null,
      },
    });
  }, 'seed');
}

describe.sequential('retention step isolation on PostgreSQL', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'retention_step_isolation');
    await applyMigrationsFromEmpty(target);
    for (const name of managedEnvironment) originalEnvironment.set(name, process.env[name]);
    process.env.DATABASE_URL = target.databaseUrl;
    applicationPrisma = (await import('@/lib/prisma')).prisma;
    await seed();
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

  it('keeps redacting and erasing while a housekeeping delete fails, records the failure, alerts on it and fails the run', async () => {
    // Every delete from rate_limits now fails, as a lock or a broken constraint would.
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      await prisma.$executeRaw`
        CREATE FUNCTION fail_rate_limit_delete() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'housekeeping blocked';
        END
        $$
      `;
      await prisma.$executeRaw`
        CREATE TRIGGER fail_rate_limit_delete BEFORE DELETE ON rate_limits
        FOR EACH ROW EXECUTE FUNCTION fail_rate_limit_delete()
      `;
      await prisma.rateLimit.create({ data: { key: 'isolation-expired', count: 1, resetTime: monthsAgo(1) } });
    }, 'verification');
    const { runRetention, evaluateOperationalAlerts } = await import('@/lib/operationalMonitor');

    await expect(runRetention()).rejects.toThrow(/1 retention step\(s\) failed: rateLimits: /);

    await withTestPrismaClient(requireTarget(), async (prisma) => {
      // The privacy steps ran: the old booked and booking-less requests lost their contact data,
      // the expired guest is gone, and the younger booking-less request is untouched.
      const rows = await prisma.checkInRequest.findMany({ orderBy: { id: 'asc' } });
      expect(rows.map((row) => [row.id, row.guestName, row.guestEmail, row.guestPhone, row.message])).toEqual([
        [id(EXPIRED_CHECK_IN), null, null, null, null],
        [id(OLD_BOOKINGLESS), null, null, null, null],
        [id(RECENT_BOOKINGLESS), 'Synthetic Guest', 'guest3@example.test', '+306900000003', 'Synthetic message'],
        [id(REDACTED_BOOKINGLESS), null, null, null, null],
      ]);
      expect(await prisma.user.count()).toBe(0);
      // The request itself stays (requested time, decision, times).
      expect(rows.map((row) => row.requestedTime)).toEqual(['15:00', '15:00', '15:00', '16:00']);
      expect(await prisma.rateLimit.count()).toBe(1);

      const events = await prisma.securityAuditEvent.findMany({ where: { eventType: 'operations.retention_step_failed' } });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ severity: 'high', details: { step: 'rateLimits', error: expect.any(String) } });
      // Neither the database message nor the table content is stored.
      expect(JSON.stringify(events[0].details)).not.toContain('housekeeping blocked');
    }, 'verification');

    // The existing alert rule on high-severity security events picks the failure up.
    await expect(evaluateOperationalAlerts()).resolves.toMatchObject({ opened: 1 });
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      const alerts = await prisma.alert.findMany({ include: { rule: true } });
      expect(alerts.map((alert) => [alert.rule.name, alert.status])).toEqual([['Recent high-severity security events', 'OPEN']]);
    }, 'verification');
  });

  it('succeeds again, without a new failure event, once the failing step works', async () => {
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      await prisma.$executeRaw`DROP TRIGGER fail_rate_limit_delete ON rate_limits`;
    }, 'verification');
    const { runRetention } = await import('@/lib/operationalMonitor');

    const result = await runRetention();

    expect(result).toMatchObject({
      rateLimits: 1,
      checkInRequestsRedacted: 0,
      bookinglessCheckInRequestsRedacted: 0,
      guestsErased: 0,
    });
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      expect(await prisma.rateLimit.count()).toBe(0);
      expect(await prisma.securityAuditEvent.count({ where: { eventType: 'operations.retention_step_failed' } })).toBe(1);
    }, 'verification');
  });
});
