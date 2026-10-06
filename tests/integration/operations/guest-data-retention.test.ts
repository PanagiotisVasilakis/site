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
const managedEnvironment = ['DATABASE_URL', 'LOG_CONSOLE', 'PRISMA_AUTO_DISCONNECT'] as const;
type ManagedEnvironmentName = typeof managedEnvironment[number];

const id = (n: number) => `75000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const monthsAgo = (months: number) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
};

// Guests
const EXPIRED_GUEST = 1;
const MIXED_GUEST = 2;
const NO_BOOKING_GUEST = 3;
// Bookings (EXPIRED_GUEST has one, MIXED_GUEST has an old and a recent one)
const EXPIRED_BOOKING = 11;
const MIXED_OLD_BOOKING = 12;
const MIXED_RECENT_BOOKING = 13;
// Check-in requests, one per booking
const EXPIRED_CHECK_IN = 21;
const MIXED_OLD_CHECK_IN = 22;
const MIXED_RECENT_CHECK_IN = 23;
const PENDING_EVENT = 31;

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Guest retention database was not initialized.');
  return target;
}

async function seed() {
  await withTestPrismaClient(requireTarget(), async (prisma) => {
    for (const n of [EXPIRED_GUEST, MIXED_GUEST, NO_BOOKING_GUEST]) {
      await prisma.user.create({
        data: { id: id(n), phoneE164: `+30690000000${n}` },
      });
    }
    const bookings: Array<[number, number, number]> = [
      [EXPIRED_BOOKING, EXPIRED_GUEST, 13],
      [MIXED_OLD_BOOKING, MIXED_GUEST, 13],
      [MIXED_RECENT_BOOKING, MIXED_GUEST, 1],
    ];
    for (const [booking, guest, endedMonthsAgo] of bookings) {
      await prisma.booking.create({
        data: {
          id: id(booking),
          source: 'EXTERNAL',
          provider: 'airbnb',
          externalReference: `HM-RETENTION-${booking}`,
          startDate: monthsAgo(endedMonthsAgo + 1),
          endDate: monthsAgo(endedMonthsAgo),
          userId: id(guest),
          accessStatus: 'VERIFIED',
          claimedAt: monthsAgo(endedMonthsAgo + 1),
        },
      });
    }
    const checkIns: Array<[number, number, number]> = [
      [EXPIRED_CHECK_IN, EXPIRED_BOOKING, EXPIRED_GUEST],
      [MIXED_OLD_CHECK_IN, MIXED_OLD_BOOKING, MIXED_GUEST],
      [MIXED_RECENT_CHECK_IN, MIXED_RECENT_BOOKING, MIXED_GUEST],
    ];
    for (const [checkIn, booking, guest] of checkIns) {
      await prisma.checkInRequest.create({
        data: {
          id: id(checkIn),
          bookingId: id(booking),
          userId: id(guest),
          guestName: 'Synthetic Guest',
          guestEmail: `guest${guest}@example.test`,
          guestPhone: `+30690000000${guest}`,
          requestedTime: '15:00',
          message: 'Synthetic message',
        },
      });
    }
    await prisma.termsAcceptance.create({
      data: {
        id: id(41),
        bookingId: id(EXPIRED_BOOKING),
        userId: id(EXPIRED_GUEST),
        termsVersion: 'v1',
        contentHash: 'a'.repeat(64),
      },
    });
    await prisma.outboxEvent.create({
      data: {
        id: id(PENDING_EVENT),
        eventType: 'check_in_time_request.created',
        destination: 'checkin_request_webhook',
        aggregateType: 'check_in_request',
        aggregateId: id(EXPIRED_CHECK_IN),
        idempotencyKey: `guest-retention:${PENDING_EVENT}`,
        payload: { previousStatus: null, status: 'PENDING' },
        checkInRequestId: id(EXPIRED_CHECK_IN),
      },
    });
  }, 'seed');
}

describe.sequential('guest data retention on PostgreSQL', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'guest_data_retention');
    await applyMigrationsFromEmpty(target);
    for (const name of managedEnvironment) originalEnvironment.set(name, process.env[name]);
    process.env.DATABASE_URL = target.databaseUrl;
    process.env.LOG_CONSOLE = 'false';
    process.env.PRISMA_AUTO_DISCONNECT = 'false';
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

  it('redacts old check-in requests and erases only guests whose every booking ended 12 months ago', async () => {
    const { runRetention } = await import('@/lib/operationalMonitor');

    const first = await runRetention();

    expect(first).toMatchObject({ checkInRequestsRedacted: 2, guestsErased: 1, guestErasuresSkipped: 0 });

    await withTestPrismaClient(requireTarget(), async (prisma) => {
      expect((await prisma.user.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).map((user) => user.id))
        .toEqual([id(MIXED_GUEST), id(NO_BOOKING_GUEST)]);

      const checkIns = await prisma.checkInRequest.findMany({ orderBy: { id: 'asc' } });
      expect(checkIns.map((row) => [row.id, row.userId, row.guestName, row.guestEmail, row.guestPhone, row.message]))
        .toEqual([
          [id(EXPIRED_CHECK_IN), null, null, null, null, null],
          [id(MIXED_OLD_CHECK_IN), id(MIXED_GUEST), null, null, null, null],
          [id(MIXED_RECENT_CHECK_IN), id(MIXED_GUEST), 'Synthetic Guest', `guest${MIXED_GUEST}@example.test`,
            `+30690000000${MIXED_GUEST}`, 'Synthetic message'],
        ]);

      // Same result as a manual erasure: booking kept and unlinked, reference kept (R-195 (a)),
      // terms acceptance removed with the user, undelivered event cancelled, audit trail written.
      expect(await prisma.booking.findUnique({
        where: { id: id(EXPIRED_BOOKING) },
        select: { userId: true, accessStatus: true, claimedAt: true, externalReference: true },
      })).toEqual({ userId: null, accessStatus: 'PENDING', claimedAt: null, externalReference: `HM-RETENTION-${EXPIRED_BOOKING}` });
      expect(await prisma.termsAcceptance.count()).toBe(0);
      expect(await prisma.outboxEvent.findUnique({
        where: { id: id(PENDING_EVENT) },
        select: { status: true, payload: true, checkInRequestId: true },
      })).toEqual({
        status: 'DEAD',
        payload: { redacted: true, reason: 'privacy_erasure' },
        checkInRequestId: id(EXPIRED_CHECK_IN),
      });
      const requests = await prisma.privacyRequest.findMany();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        userId: null,
        requestType: 'ERASURE',
        status: 'COMPLETED',
        auditNote: 'Automatic retention: every booking of this guest ended more than 12 months ago.',
      });
      expect(await prisma.securityAuditEvent.count({ where: { eventType: 'privacy.erasure.completed' } })).toBe(1);
    }, 'verification');

    // The next run removes the erasure-cancelled event and has nothing more to redact or erase.
    const second = await runRetention();
    expect(second).toMatchObject({ deadOutbox: 1, checkInRequestsRedacted: 0, guestsErased: 0 });
  });

  it('re-checks the cutoff inside the erasure transaction and leaves no request behind when it skips', async () => {
    const { eraseGuestForRetention } = await import('@/lib/privacyService');
    const cutoff = monthsAgo(12);

    // MIXED_GUEST has a booking that ended 1 month ago, as if claimed after runRetention selected the guest.
    await expect(eraseGuestForRetention(id(MIXED_GUEST), 'Automatic retention', cutoff)).resolves.toBe(false);

    await withTestPrismaClient(requireTarget(), async (prisma) => {
      expect(await prisma.user.count({ where: { id: id(MIXED_GUEST) } })).toBe(1);
      expect(await prisma.booking.findUnique({ where: { id: id(MIXED_RECENT_BOOKING) }, select: { userId: true } }))
        .toEqual({ userId: id(MIXED_GUEST) });
      expect(await prisma.privacyRequest.count()).toBe(1);
      expect(await prisma.securityAuditEvent.count({ where: { eventType: 'privacy.erasure.completed' } })).toBe(1);
    }, 'verification');
  });
});
