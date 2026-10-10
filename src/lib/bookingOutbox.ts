import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';
import crypto from 'node:crypto';
import os from 'node:os';

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;
const CHECKIN_DESTINATION = 'checkin_request_webhook';

function payloadRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

export async function deliverOutboxEvent(eventId: string): Promise<boolean> {
  const candidate = await prisma.outboxEvent.findUnique({
    where: { id: eventId },
    select: { destination: true },
  });
  if (!candidate || candidate.destination !== CHECKIN_DESTINATION) return false;
  const config = { url: process.env.CHECKIN_REQUEST_WEBHOOK_URL, token: process.env.CHECKIN_REQUEST_WEBHOOK_TOKEN };

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
      include: { checkInRequest: true },
    });
    if (!event || event.status !== 'LEASED' || event.leaseOwner !== leaseOwner) return false;
    if (!config.url) throw new Error('Webhook destination is not configured');
    // The workers never run the environment schema, so the production HTTPS rule is enforced here, before the bearer token is attached.
    if (process.env.NODE_ENV === 'production' && new URL(config.url).protocol !== 'https:') {
      throw new Error('Webhook destination must use HTTPS in production');
    }

    const payload = payloadRecord(event.payload);
    const body = event.checkInRequest
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
    if (!body) throw new Error('Outbox aggregate is missing');

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Idempotency-Key': event.id,
    };
    if (config.token) headers.Authorization = `Bearer ${config.token}`;
    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'error',
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
      return updated.count === 1;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown webhook failure';
    const exhausted = attempt.attemptCount >= MAX_ATTEMPTS;
    const delayMinutes = Math.min(60, 2 ** Math.max(0, attempt.attemptCount - 1));
    await prisma.$transaction(async (tx) => {
      await tx.outboxEvent.updateMany({
        where: { id: eventId, status: 'LEASED', leaseOwner },
        data: {
          status: exhausted ? 'DEAD' : 'PENDING',
          lastError: message,
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
    });
    logger.warn('Outbox webhook delivery deferred', { eventId, destination: candidate.destination, error: message });
    return false;
  }
}

async function deliverWithConcurrency(eventIds: readonly string[], concurrency: number): Promise<boolean[]> {
  const results = new Array<boolean>(eventIds.length);
  const failures: unknown[] = [];
  let index = 0;
  const worker = async () => {
    while (index < eventIds.length) {
      const current = index;
      index += 1;
      try {
        results[current] = await deliverOutboxEvent(eventIds[current]);
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(new Array(Math.min(concurrency, eventIds.length)).fill(null).map(() => worker()));
  // Fail only after every delivery has settled, so the worker script's disconnect never races a delivery still running.
  if (failures.length > 0) throw new AggregateError(failures, `${failures.length} outbox deliveries failed: ${failures.map((failure) => (failure instanceof Error ? failure.message : String(failure)).slice(0, 500)).join('; ')}`);
  return results;
}

export async function drainOutbox(batchSize = 20): Promise<{ attempted: number; delivered: number }> {
  await prisma.outboxEvent.updateMany({
    where: {
      destination: CHECKIN_DESTINATION,
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
      destination: CHECKIN_DESTINATION,
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
