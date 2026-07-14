import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger-enterprise';

export async function deliverBookingOutboxEvent(eventId: string): Promise<boolean> {
  const webhookUrl = process.env.BOOKING_REQUEST_WEBHOOK_URL;
  if (!webhookUrl) return false;

  const claimed = await prisma.webhookOutbox.updateMany({
    where: { id: eventId, status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    data: { status: 'PROCESSING', attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return false;

  const event = await prisma.webhookOutbox.findUnique({
    where: { id: eventId },
    include: { stayRequest: true },
  });
  if (!event) return false;

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  const token = process.env.BOOKING_REQUEST_WEBHOOK_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: event.eventType,
        eventId: event.id,
        submittedAt: event.createdAt.toISOString(),
        request: event.stayRequest,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Webhook responded with ${response.status}`);

    await prisma.$transaction([
      prisma.webhookOutbox.update({
        where: { id: event.id },
        data: { status: 'DELIVERED', deliveredAt: new Date(), lastError: null },
      }),
      prisma.stayRequest.update({ where: { id: event.stayRequestId }, data: { status: 'DELIVERED' } }),
    ]);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown webhook failure';
    const exhausted = event.attemptCount >= 10;
    const delayMinutes = Math.min(60, 2 ** Math.max(0, event.attemptCount - 1));
    await prisma.$transaction([
      prisma.webhookOutbox.update({
        where: { id: event.id },
        data: {
          status: exhausted ? 'FAILED' : 'PENDING',
          lastError: message,
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
        },
      }),
      prisma.stayRequest.update({
        where: { id: event.stayRequestId },
        data: { status: exhausted ? 'DELIVERY_FAILED' : 'PENDING' },
      }),
    ]);
    logger.warn('Booking request webhook delivery deferred', { eventId, error: message });
    return false;
  }
}

export async function drainBookingOutbox(batchSize = 20): Promise<{ attempted: number; delivered: number }> {
  // Recover work abandoned by a crashed process. updatedAt acts as a lease timestamp.
  await prisma.webhookOutbox.updateMany({
    where: { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
    data: { status: 'PENDING', nextAttemptAt: new Date(), lastError: 'Recovered abandoned delivery lease' },
  });
  const events = await prisma.webhookOutbox.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: Math.min(Math.max(batchSize, 1), 100),
    select: { id: true },
  });
  const results = await Promise.all(events.map(({ id }) => deliverBookingOutboxEvent(id)));
  return { attempted: events.length, delivered: results.filter(Boolean).length };
}
