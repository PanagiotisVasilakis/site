import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { createPortalBookingEligibilityWindow } from '@/lib/portalBookingEligibility';

import type { DisposableDatabaseTarget } from '../support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { withTestPrismaClient } from '../support/fixtures';
import { applyMigrationsFromEmpty } from '../support/migrations';
import { readDisposablePostgresRuntime } from '../support/runtime';

const runtime = readDisposablePostgresRuntime();
const managedEnvironment = ['CHECKIN_REQUEST_WEBHOOK_URL', 'DATABASE_URL'] as const;
type ManagedEnvironmentName = typeof managedEnvironment[number];

const id = (n: number) => `78000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const phone = (guest: number) => `+30690000000${guest}`;

// Guests: NEXT_GUEST claims the booking after GUEST has been erased.
const GUEST = 1;
const NEXT_GUEST = 2;
const BOOKING = 11;
// Outbox events inserted by hand; create() gives its own events random ids.
const DELIVERED_EVENT = 21;
const FAILED_EVENT = 22;

const ERASURE_NOTE = 'Verified by a phone call to the booking number';
// What privacyService.ts leaves in the payload of an event it cancels.
const ERASURE_CANCELLED = { redacted: true, reason: 'privacy_erasure' };
const CREATED_NOTIFICATION = { eventType: 'check_in_time_request.created', nextStatus: 'PENDING' } as const;

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Check-in request database was not initialized.');
  return target;
}

// A guest who owns a booking inside the portal eligibility window (arrival today, three nights).
async function seedGuestWithBooking(): Promise<void> {
  const { businessToday } = createPortalBookingEligibilityWindow(new Date());
  const endDate = new Date(businessToday);
  endDate.setUTCDate(endDate.getUTCDate() + 3);
  await withTestPrismaClient(requireTarget(), async (prisma) => {
    await prisma.user.create({ data: { id: id(GUEST), phoneE164: phone(GUEST) } });
    await prisma.booking.create({
      data: {
        id: id(BOOKING),
        source: 'EXTERNAL',
        provider: 'airbnb',
        externalReference: 'HM-CHECK-IN-REPOSITORY',
        startDate: businessToday,
        endDate,
        userId: id(GUEST),
        accessStatus: 'VERIFIED',
        claimedAt: new Date(),
      },
    });
  }, 'seed');
}

// What the outbox worker leaves behind once a delivery has used up its attempts (MAX_ATTEMPTS in bookingOutbox.ts).
function exhausted() {
  return {
    status: 'DEAD' as const,
    attemptCount: 10,
    lastError: 'Webhook responded with status 500',
    nextAttemptAt: new Date(Date.now() + 60 * 60_000),
  };
}

// An event inserted by hand beside the ones create() writes; `state` overrides its defaults.
function eventData(
  n: number,
  checkInRequestId: string,
  state: Partial<Prisma.OutboxEventUncheckedCreateInput> = {},
): Prisma.OutboxEventUncheckedCreateInput {
  return {
    id: id(n),
    eventType: 'check_in_time_request.updated',
    destination: 'checkin_request_webhook',
    aggregateType: 'check_in_request',
    aggregateId: checkInRequestId,
    idempotencyKey: `check-in-request-repository:${n}`,
    payload: { previousStatus: 'PENDING', status: 'APPROVED' },
    checkInRequestId,
    ...state,
  };
}

async function outboxEvent(eventId: string) {
  return withTestPrismaClient(requireTarget(), (prisma) => prisma.outboxEvent.findUniqueOrThrow({
    where: { id: eventId },
    select: { status: true, attemptCount: true, lastError: true, nextAttemptAt: true, payload: true },
  }));
}

// The booking's requests and every outbox event (not only the linked ones, so an orphan shows up).
async function storedRows(bookingId: string) {
  return withTestPrismaClient(requireTarget(), async (prisma) => ({
    requests: await prisma.checkInRequest.findMany({
      where: { bookingId },
      select: { id: true, status: true, requestedTime: true },
    }),
    events: await prisma.outboxEvent.findMany({
      select: {
        id: true,
        checkInRequestId: true,
        eventType: true,
        destination: true,
        aggregateType: true,
        aggregateId: true,
        idempotencyKey: true,
        payload: true,
        status: true,
      },
    }),
  }));
}

describe.sequential('check-in request repository on PostgreSQL', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'check_in_requests');
    await applyMigrationsFromEmpty(target);
    for (const name of managedEnvironment) originalEnvironment.set(name, process.env[name]);
    process.env.DATABASE_URL = target.databaseUrl;
    // Only the presence of the URL matters: create() writes the event, nothing here delivers it.
    process.env.CHECKIN_REQUEST_WEBHOOK_URL = 'https://hooks.example.test/check-in';
    applicationPrisma = (await import('@/lib/prisma')).prisma;
  });

  afterEach(async () => {
    if (target) {
      await withTestPrismaClient(requireTarget(), async (prisma) => {
        await prisma.$transaction([
          prisma.outboxEvent.deleteMany(),
          prisma.checkInRequest.deleteMany(),
          prisma.privacyRequest.deleteMany(),
          prisma.securityAuditEvent.deleteMany(),
          prisma.booking.deleteMany(),
          prisma.user.deleteMany(),
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

  it('stores one request with one linked outbox event, then reuses the pending request through P2002 without new rows', async () => {
    await seedGuestWithBooking();
    const { checkInRequestRepository } = await import('@/lib/prisma-repositories/checkInRequestRepository');

    const first = await checkInRequestRepository.create({
      bookingId: id(BOOKING),
      userId: id(GUEST),
      guestPhone: phone(GUEST),
      requestedTime: '15:00',
      message: 'First request',
    }, CREATED_NOTIFICATION);

    expect(first).toMatchObject({
      created: true,
      request: { booking_id: id(BOOKING), user_id: id(GUEST), requested_time: '15:00', status: 'PENDING' },
    });
    const afterFirst = await storedRows(id(BOOKING));
    expect(afterFirst).toEqual({
      requests: [{ id: first.request.id, status: 'PENDING', requestedTime: '15:00' }],
      events: [{
        id: first.notificationEventId,
        checkInRequestId: first.request.id,
        eventType: 'check_in_time_request.created',
        destination: 'checkin_request_webhook',
        aggregateType: 'check_in_request',
        aggregateId: first.request.id,
        idempotencyKey: `check_in_time_request.created:${first.request.id}`,
        payload: { previousStatus: null, status: 'PENDING' },
        status: 'PENDING',
      }],
    });

    // The partial unique index check_in_requests_one_pending_per_booking rejects the second insert.
    const second = await checkInRequestRepository.create({
      bookingId: id(BOOKING),
      userId: id(GUEST),
      guestPhone: phone(GUEST),
      requestedTime: '17:30',
      message: 'Second request',
    }, CREATED_NOTIFICATION);

    expect(second.created).toBe(false);
    expect(second.notificationEventId).toBeUndefined();
    expect(second.request).toMatchObject({ id: first.request.id, requested_time: '15:00', message: 'First request' });
    expect(await storedRows(id(BOOKING))).toEqual(afterFirst);
  });

  it('requeues an exhausted notification with a fresh attempt count and leaves other events alone', async () => {
    const { checkInRequestRepository } = await import('@/lib/prisma-repositories/checkInRequestRepository');
    const failed = await checkInRequestRepository.create({ requestedTime: '15:00' }, CREATED_NOTIFICATION);
    const other = await checkInRequestRepository.create({ requestedTime: '16:00' }, CREATED_NOTIFICATION);
    const failedEventId = failed.notificationEventId!;
    const otherEventId = other.notificationEventId!;
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      await prisma.outboxEvent.updateMany({
        where: { id: { in: [failedEventId, otherEventId] } },
        data: exhausted(),
      });
      await prisma.outboxEvent.create({
        data: eventData(DELIVERED_EVENT, failed.request.id, { status: 'DELIVERED', attemptCount: 1, deliveredAt: new Date() }),
      });
    }, 'seed');

    await expect(checkInRequestRepository.retryFailedNotifications(failed.request.id)).resolves.toBe(1);

    const requeued = await outboxEvent(failedEventId);
    expect(requeued).toMatchObject({ status: 'PENDING', attemptCount: 0, lastError: null });
    expect(requeued.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
    // A delivered event of the same request and an exhausted event of another request keep their state.
    expect(await outboxEvent(id(DELIVERED_EVENT))).toMatchObject({ status: 'DELIVERED' });
    expect(await outboxEvent(otherEventId)).toMatchObject({ status: 'DEAD', attemptCount: 10 });
  });

  it('does not requeue a notification that a privacy erasure cancelled, only a failed one beside it', async () => {
    await seedGuestWithBooking();
    const { checkInRequestRepository } = await import('@/lib/prisma-repositories/checkInRequestRepository');
    const { eraseGuestByAdmin } = await import('@/lib/privacyService');
    const created = await checkInRequestRepository.create({
      bookingId: id(BOOKING),
      userId: id(GUEST),
      requestedTime: '15:00',
    }, CREATED_NOTIFICATION);
    const cancelledEventId = created.notificationEventId!;

    await eraseGuestByAdmin(id(GUEST), ERASURE_NOTE);

    // The erasure cancelled the undelivered event (DEAD, payload replaced): there is nothing to retry.
    expect(await outboxEvent(cancelledEventId)).toMatchObject({ status: 'DEAD', payload: ERASURE_CANCELLED });
    await expect(checkInRequestRepository.retryFailedNotifications(created.request.id)).resolves.toBe(0);
    expect(await outboxEvent(cancelledEventId)).toMatchObject({ status: 'DEAD', payload: ERASURE_CANCELLED });

    // A real failure of the same request is requeued; the cancelled event stays DEAD.
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      await prisma.outboxEvent.create({ data: eventData(FAILED_EVENT, created.request.id, exhausted()) });
    }, 'seed');
    await expect(checkInRequestRepository.retryFailedNotifications(created.request.id)).resolves.toBe(1);
    expect(await outboxEvent(id(FAILED_EVENT))).toMatchObject({ status: 'PENDING', attemptCount: 0 });
    expect(await outboxEvent(cancelledEventId)).toMatchObject({ status: 'DEAD', payload: ERASURE_CANCELLED });
  });

  it('frees the pending arrival slot of an erased booking for the next guest', async () => {
    await seedGuestWithBooking();
    const { checkInRequestRepository } = await import('@/lib/prisma-repositories/checkInRequestRepository');
    const { eraseGuestByAdmin } = await import('@/lib/privacyService');
    const erased = await checkInRequestRepository.create({
      bookingId: id(BOOKING),
      userId: id(GUEST),
      requestedTime: '15:00',
    }, CREATED_NOTIFICATION);
    expect(erased.created).toBe(true);

    await eraseGuestByAdmin(id(GUEST), ERASURE_NOTE);

    // The request is closed but stays linked to its booking, and the booking has no owner any more.
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      expect(await prisma.checkInRequest.findUnique({
        where: { id: erased.request.id },
        select: { status: true, bookingId: true },
      })).toEqual({ status: 'REJECTED', bookingId: id(BOOKING) });
      expect(await prisma.booking.findUnique({ where: { id: id(BOOKING) }, select: { userId: true } }))
        .toEqual({ userId: null });
    }, 'verification');
    // A new guest claims the booking.
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      await prisma.user.create({ data: { id: id(NEXT_GUEST), phoneE164: phone(NEXT_GUEST) } });
      await prisma.booking.update({
        where: { id: id(BOOKING) },
        data: { userId: id(NEXT_GUEST), accessStatus: 'VERIFIED', claimedAt: new Date() },
      });
    }, 'seed');

    const next = await checkInRequestRepository.create({
      bookingId: id(BOOKING),
      userId: id(NEXT_GUEST),
      requestedTime: '16:00',
    }, CREATED_NOTIFICATION);

    expect(next.created).toBe(true);
    expect(next.request.id).not.toBe(erased.request.id);
    await withTestPrismaClient(requireTarget(), async (prisma) => {
      expect(await prisma.checkInRequest.findMany({
        where: { bookingId: id(BOOKING), status: 'PENDING' },
        select: { id: true },
      })).toEqual([{ id: next.request.id }]);
    }, 'verification');
  });
});
