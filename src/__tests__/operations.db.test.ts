import crypto from 'node:crypto';

import {
  analyticsStats,
  dayBuckets,
  recordAnalyticsHits,
  recordVital,
  topPaths,
  vitalsSummary,
} from '@/lib/analyticsRepository';
import { evaluateOperationalAlerts } from '@/lib/operationalMonitor';
import { completeErasureRequest, createVerifiedErasureRequest } from '@/lib/privacyService';
import { prisma } from '@/lib/prisma';
import { checkInRequestRepository } from '@/lib/prisma-repositories/checkInRequestRepository';

describe('database-backed operations', () => {
  it('creates a check-in request and its notification atomically', async () => {
    process.env.CHECKIN_REQUEST_WEBHOOK_URL = 'https://example.test/check-in';
    const created = await checkInRequestRepository.create({
      requestedTime: '13:30',
      guestEmail: 'queue@example.test',
      message: 'Durable notification test',
    }, {
      eventType: 'check_in_time_request.created',
      nextStatus: 'PENDING',
    });
    expect(created.notificationEventId).toBeTruthy();
    const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: created.notificationEventId } });
    expect(event).toMatchObject({
      destination: 'checkin_request_webhook',
      aggregateId: created.request.id,
      checkInRequestId: created.request.id,
      status: 'PENDING',
    });

    await prisma.outboxEvent.delete({ where: { id: event.id } });
    await prisma.checkInRequest.delete({ where: { id: created.request.id } });
    delete process.env.CHECKIN_REQUEST_WEBHOOK_URL;
  });

  it('serializes concurrent duplicate check-in status updates into one notification', async () => {
    process.env.CHECKIN_REQUEST_WEBHOOK_URL = 'https://example.test/check-in';
    const created = await checkInRequestRepository.create({ requestedTime: '14:00' });

    const updates = await Promise.all([
      checkInRequestRepository.updateStatus(created.request.id, 'APPROVED'),
      checkInRequestRepository.updateStatus(created.request.id, 'APPROVED'),
    ]);
    expect(updates.map((update) => update.changed).sort()).toEqual([false, true]);
    const events = await prisma.outboxEvent.findMany({
      where: { checkInRequestId: created.request.id, eventType: 'check_in_time_request.updated' },
    });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ previousStatus: 'PENDING', status: 'APPROVED' });

    await prisma.outboxEvent.deleteMany({ where: { checkInRequestId: created.request.id } });
    await prisma.checkInRequest.delete({ where: { id: created.request.id } });
    delete process.env.CHECKIN_REQUEST_WEBHOOK_URL;
  });

  it('persists privacy-safe analytics and returns database aggregates', async () => {
    const marker = crypto.randomUUID();
    const path = `/integration/${marker}`;
    await recordAnalyticsHits([
      { path, locale: 'en' },
      { path, locale: 'en', eventName: 'checkin_viewed', properties: {} },
    ]);
    await recordVital({ name: 'LCP', value: 1_234, id: marker, path });

    const [top, stats, days, vitals] = await Promise.all([
      topPaths(100),
      analyticsStats(),
      dayBuckets(2),
      vitalsSummary(),
    ]);
    expect(top).toContainEqual({ path, count: 2 });
    expect(stats.uniquePaths).toBeGreaterThanOrEqual(1);
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBeGreaterThanOrEqual(2);
    expect(vitals.find((vital) => vital.name === 'LCP')).toMatchObject({ count: expect.any(Number) });

    await prisma.analyticsVital.deleteMany({ where: { metricId: marker } });
    await prisma.analyticsHit.deleteMany({ where: { path } });
  });

  it('retries durable alert notifications and preserves administrator thresholds', async () => {
    const eventId = crypto.randomUUID();
    await prisma.securityAuditEvent.deleteMany({ where: { severity: { in: ['high', 'critical'] } } });
    await prisma.outboxEvent.deleteMany({ where: { status: 'DEAD' } });
    await prisma.alert.deleteMany();
    await prisma.alertRule.deleteMany();
    await prisma.outboxEvent.create({
      data: {
        id: eventId,
        eventType: 'integration.failed',
        destination: 'integration',
        aggregateType: 'test',
        aggregateId: eventId,
        idempotencyKey: `integration:${eventId}`,
        payload: { test: true },
        status: 'DEAD',
      },
    });

    process.env.ALERT_WEBHOOK_URL = 'https://alerts.invalid/hook';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(evaluateOperationalAlerts()).rejects.toThrow('503');

    const failed = await prisma.alert.findFirstOrThrow({
      where: { rule: { name: 'Dead outbox events' } },
    });
    expect(failed).toMatchObject({ notificationAttempts: 1, notificationDeliveredAt: null });
    expect(failed.notificationLastError).toContain('503');

    await expect(evaluateOperationalAlerts()).resolves.toMatchObject({ evaluated: 3 });
    const delivered = await prisma.alert.findUniqueOrThrow({ where: { id: failed.id } });
    expect(delivered.notificationAttempts).toBe(2);
    expect(delivered.notificationDeliveredAt).toBeInstanceOf(Date);

    const rule = await prisma.alertRule.findUniqueOrThrow({ where: { name: 'Dead outbox events' } });
    await prisma.alertRule.update({ where: { id: rule.id }, data: { threshold: 999 } });
    await evaluateOperationalAlerts();
    const preserved = await prisma.alertRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(preserved.threshold).toBe(999);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe('RESOLVED');

    delete process.env.ALERT_WEBHOOK_URL;
    vi.unstubAllGlobals();
    await prisma.outboxEvent.deleteMany({ where: { id: eventId } });
  });

  it('completes a verified erasure atomically and removes queued PII', async () => {
    const userId = crypto.randomUUID();
    const bookingId = crypto.randomUUID();
    const stayRequestId = crypto.randomUUID();
    const phone = `+3068${String(Date.now()).slice(-8)}`;
    const email = `erase-${userId}@example.test`;
    await prisma.user.create({
      data: { id: userId, phoneE164: phone, email, countryOrigin: 'GR', passwordHash: 'test-hash' },
    });
    await prisma.booking.create({
      data: {
        id: bookingId,
        source: 'EXTERNAL',
        provider: 'integration',
        externalReference: userId,
        reference: `ERASE-${userId}`,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86_400_000),
        userId,
        accessStatus: 'VERIFIED',
        claimedAt: new Date(),
      },
    });
    await prisma.checkin.create({
      data: { bookingId, arrivalTime: '16:00', specialRequests: 'Sensitive request', acceptedAt: new Date() },
    });
    const checkInRequestId = crypto.randomUUID();
    await prisma.checkInRequest.create({
      data: {
        id: checkInRequestId,
        bookingId,
        userId,
        guestEmail: email,
        guestPhone: phone,
        requestedTime: '13:30',
        message: 'Private arrival message',
        outboxEvents: {
          create: {
            id: crypto.randomUUID(),
            eventType: 'check_in_time_request.created',
            destination: 'checkin_request_webhook',
            aggregateType: 'check_in_request',
            aggregateId: checkInRequestId,
            idempotencyKey: `erase-check-in-outbox:${checkInRequestId}`,
            payload: { status: 'PENDING' },
          },
        },
      },
    });
    await prisma.stayRequest.create({
      data: {
        id: stayRequestId,
        propertyName: 'Integration',
        locale: 'en',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86_400_000),
        firstName: 'Personal',
        lastName: 'Name',
        email,
        phone,
        specialRequests: 'Private note',
        idempotencyKey: `erase:${stayRequestId}`,
      },
    });
    await prisma.outboxEvent.create({
      data: {
        id: crypto.randomUUID(),
        eventType: 'booking.requested',
        destination: 'booking_request_webhook',
        aggregateType: 'stay_request',
        aggregateId: stayRequestId,
        idempotencyKey: `erase-outbox:${stayRequestId}`,
        stayRequestId,
        payload: { firstName: 'Personal', email, phone },
      },
    });

    const created = await createVerifiedErasureRequest(userId, bookingId);
    const completed = await completeErasureRequest(created.request.id, 'Approved after operator review.');
    expect(completed.status).toBe('COMPLETED');
    expect(completed.userId).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).toMatchObject({
      userId: null,
      reference: null,
      externalReference: null,
      accessStatus: 'PENDING',
    });
    expect((await prisma.checkin.findUniqueOrThrow({ where: { bookingId } })).specialRequests).toBeNull();
    const stay = await prisma.stayRequest.findUniqueOrThrow({ where: { id: stayRequestId } });
    expect(stay.email).not.toBe(email);
    expect(stay.phone).not.toBe(phone);
    expect(stay.specialRequests).toBeNull();
    const outbox = await prisma.outboxEvent.findFirstOrThrow({ where: { stayRequestId } });
    expect(outbox.status).toBe('DEAD');
    expect(JSON.stringify(outbox.payload)).not.toContain(email);
    const checkInOutbox = await prisma.outboxEvent.findFirstOrThrow({ where: { checkInRequestId } });
    expect(checkInOutbox.status).toBe('DEAD');
    expect(JSON.stringify(checkInOutbox.payload)).not.toContain(email);

    await prisma.outboxEvent.deleteMany({ where: { OR: [{ stayRequestId }, { checkInRequestId }] } });
    await prisma.checkInRequest.deleteMany({ where: { id: checkInRequestId } });
    await prisma.stayRequest.deleteMany({ where: { id: stayRequestId } });
    await prisma.privacyRequest.deleteMany({ where: { id: created.request.id } });
    await prisma.securityAuditEvent.deleteMany({ where: { eventType: 'privacy.erasure.completed' } });
    await prisma.booking.deleteMany({ where: { id: bookingId } });
  });
});
