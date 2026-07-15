import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import crypto from 'node:crypto';
import os from 'node:os';

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;
const BOOKING_DESTINATION = 'booking_request_webhook';
const CHECKIN_DESTINATION = 'checkin_request_webhook';
const SUPPORTED_DESTINATIONS = [BOOKING_DESTINATION, CHECKIN_DESTINATION];

function webhookConfig(destination: string): { url?: string; token?: string } {
  if (destination === BOOKING_DESTINATION) {
    return { url: process.env.BOOKING_REQUEST_WEBHOOK_URL, token: process.env.BOOKING_REQUEST_WEBHOOK_TOKEN };
  }
  if (destination === CHECKIN_DESTINATION) {
    return { url: process.env.CHECKIN_REQUEST_WEBHOOK_URL, token: process.env.CHECKIN_REQUEST_WEBHOOK_TOKEN };
  }
  return {};
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

export async function deliverOutboxEvent(eventId: string): Promise<boolean> {
  const candidate = await prisma.outboxEvent.findUnique({
    where: { id: eventId },
    select: { destination: true, stayRequestId: true },
  });
  if (!candidate || !SUPPORTED_DESTINATIONS.includes(candidate.destination)) return false;
  const config = webhookConfig(candidate.destination);

  const leaseOwner = `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`;
  const claimed = await prisma.outboxEvent.updateMany({
    where: {
      id: eventId,
      destination: candidate.destination,
      status: 'PENDING',
      nextAttemptAt: { lte: new Date() },
    },
    data: {
      status: 'LEASED',
      attemptCount: { increment: 1 },
      leaseOwner,
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
    },
  });
  if (claimed.count !== 1) return false;

  const attempt = await prisma.outboxEvent.findUnique({ where: { id: eventId }, select: { attemptCount: true } });
  if (!attempt) return false;

  try {
    const event = await prisma.outboxEvent.findUnique({
      where: { id: eventId },
      include: { stayRequest: true, checkInRequest: true },
    });
    if (!event || event.status !== 'LEASED' || event.leaseOwner !== leaseOwner) return false;
    if (!config.url) throw new Error('Webhook destination is not configured');

    const payload = payloadRecord(event.payload);
    const body = event.destination === BOOKING_DESTINATION
      ? {
          event: event.eventType,
          eventId: event.id,
          submittedAt: event.createdAt.toISOString(),
          request: event.stayRequest,
        }
      : event.checkInRequest
        ? {
            event: event.eventType,
            eventId: event.id,
            requestId: event.checkInRequest.id,
            bookingId: event.checkInRequest.bookingId,
            userId: event.checkInRequest.userId,
            guestName: event.checkInRequest.guestName,
            guestEmail: event.checkInRequest.guestEmail,
            guestPhone: event.checkInRequest.guestPhone,
            requestedTime: event.checkInRequest.requestedTime,
            message: event.checkInRequest.message,
            previousStatus: payload.previousStatus ?? undefined,
            status: payload.status ?? event.checkInRequest.status,
            occurredAt: event.createdAt.toISOString(),
          }
        : null;
    if (!body || (event.destination === BOOKING_DESTINATION && !event.stayRequest)) {
      throw new Error('Outbox aggregate is missing');
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Idempotency-Key': event.id,
    };
    if (config.token) headers.Authorization = `Bearer ${config.token}`;
    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Webhook responded with ${response.status}`);

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: 'LEASED', leaseOwner },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          lastError: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count !== 1) return false;
      if (event.destination === BOOKING_DESTINATION && event.stayRequestId) {
        await tx.stayRequest.update({ where: { id: event.stayRequestId }, data: { status: 'DELIVERED' } });
      }
      return true;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown webhook failure';
    const exhausted = attempt.attemptCount >= MAX_ATTEMPTS;
    const delayMinutes = Math.min(60, 2 ** Math.max(0, attempt.attemptCount - 1));
    await prisma.$transaction(async (tx) => {
      const updated = await tx.outboxEvent.updateMany({
        where: { id: eventId, status: 'LEASED', leaseOwner },
        data: {
          status: exhausted ? 'DEAD' : 'PENDING',
          lastError: message,
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count === 1 && candidate.destination === BOOKING_DESTINATION && candidate.stayRequestId) {
        await tx.stayRequest.update({
            where: { id: candidate.stayRequestId },
            data: { status: exhausted ? 'DELIVERY_FAILED' : 'PENDING' },
        });
      }
    });
    logger.warn('Outbox webhook delivery deferred', { eventId, destination: candidate.destination, error: message });
    return false;
  }
}

async function deliverWithConcurrency(eventIds: readonly string[], concurrency: number): Promise<boolean[]> {
  const results = new Array<boolean>(eventIds.length);
  let index = 0;
  const worker = async () => {
    while (index < eventIds.length) {
      const current = index;
      index += 1;
      results[current] = await deliverOutboxEvent(eventIds[current]);
    }
  };
  await Promise.all(new Array(Math.min(concurrency, eventIds.length)).fill(null).map(() => worker()));
  return results;
}

export async function drainOutbox(batchSize = 20): Promise<{ attempted: number; delivered: number }> {
  await prisma.outboxEvent.updateMany({
    where: {
      destination: { in: SUPPORTED_DESTINATIONS },
      status: 'LEASED',
      leaseExpiresAt: { lt: new Date() },
    },
    data: {
      status: 'PENDING',
      nextAttemptAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: 'Recovered abandoned delivery lease',
    },
  });
  const events = await prisma.outboxEvent.findMany({
    where: {
      destination: { in: SUPPORTED_DESTINATIONS },
      status: 'PENDING',
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: Math.min(Math.max(batchSize, 1), 100),
    select: { id: true },
  });
  const results = await deliverWithConcurrency(events.map(({ id }) => id), 5);
  return { attempted: events.length, delivered: results.filter(Boolean).length };
}
