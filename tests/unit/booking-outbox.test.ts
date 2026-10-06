import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the two tables the outbox touches. It supports only
// the filters and updates bookingOutbox.ts uses (equality, lte/lt, in, increment).
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ events: new Map<string, Row>(), checkInRequests: new Map<string, Row>() }));

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const value = row[field];
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const c = condition as { lte?: Date; lt?: Date; in?: unknown[] };
      if (c.lte) return value instanceof Date && value.getTime() <= c.lte.getTime();
      if (c.lt) return value instanceof Date && value.getTime() < c.lt.getTime();
      if (c.in) return c.in.includes(value);
    }
    return value === condition;
  });
}

function apply(row: Row, data: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(data)) {
    const increment = value && typeof value === 'object' && 'increment' in value ? (value as { increment: number }).increment : undefined;
    row[field] = increment === undefined ? value : Number(row[field]) + increment;
  }
}

const prismaMock = vi.hoisted(() => {
  const outboxEvent = {
    findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: Record<string, boolean> }) => {
      const row = db.events.get(where.id);
      if (!row) return null;
      return include
        ? { ...row, checkInRequest: row.checkInRequestId ? db.checkInRequests.get(String(row.checkInRequestId)) ?? null : null }
        : { ...row };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of db.events.values()) if (matches(row, where)) { apply(row, data); count += 1; }
      return { count };
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => (
      [...db.events.values()].filter((row) => matches(row, where)).map((row) => ({ id: row.id }))
    )),
  };
  return { outboxEvent, $transaction: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { deliverOutboxEvent, drainOutbox } from '@/lib/bookingOutbox';

const NOW = new Date('2030-06-01T12:00:00.000Z');
const EVENT_ID = '81000000-0000-4000-8000-000000000001';
const CHECK_IN_ID = '81000000-0000-4000-8000-000000000002';
const BOOKING_ID = '81000000-0000-4000-8000-000000000003';
const USER_ID = '81000000-0000-4000-8000-000000000004';
const LEFTOVER_EVENT_ID = '81000000-0000-4000-8000-000000000005';
const LEFTOVER_LEASED_EVENT_ID = '81000000-0000-4000-8000-000000000006';
const LEFTOVER_STAY_ID = '81000000-0000-4000-8000-000000000007';

function seed(overrides: Row = {}) {
  db.checkInRequests.set(CHECK_IN_ID, {
    id: CHECK_IN_ID,
    bookingId: BOOKING_ID,
    userId: USER_ID,
    guestName: 'Ada Lovelace',
    guestEmail: 'ada@example.test',
    guestPhone: '+306912345678',
    requestedTime: '15:00',
    message: 'Arriving by ferry',
    status: 'PENDING',
  });
  db.events.set(EVENT_ID, {
    id: EVENT_ID,
    eventType: 'check_in_time_request.created',
    destination: 'checkin_request_webhook',
    aggregateType: 'check_in_request',
    aggregateId: CHECK_IN_ID,
    payload: { previousStatus: null, status: 'PENDING' },
    status: 'PENDING',
    attemptCount: 0,
    nextAttemptAt: new Date(NOW.getTime() - 1_000),
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: null,
    deliveredAt: null,
    createdAt: NOW,
    checkInRequestId: CHECK_IN_ID,
    ...overrides,
  });
}

// An event the removed booking-request route could have written. The
// remove_stay_requests migration refuses to run while such a row exists, so the
// outbox code must never claim or drain one in the meantime.
function seedLeftoverBookingEvent(id: string, overrides: Row = {}) {
  db.events.set(id, {
    id,
    eventType: 'booking_request.created',
    destination: 'booking_request_webhook',
    aggregateType: 'stay_request',
    aggregateId: LEFTOVER_STAY_ID,
    payload: { stayRequestId: LEFTOVER_STAY_ID },
    status: 'PENDING',
    attemptCount: 0,
    nextAttemptAt: new Date(NOW.getTime() - 1_000),
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: null,
    deliveredAt: null,
    createdAt: NOW,
    checkInRequestId: null,
    ...overrides,
  });
}

const event = () => db.events.get(EVENT_ID)!;

describe('check-in outbox delivery state machine', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    db.events.clear();
    db.checkInRequests.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('CHECKIN_REQUEST_WEBHOOK_URL', 'https://hooks.example.test/check-in');
    vi.stubEnv('CHECKIN_REQUEST_WEBHOOK_TOKEN', 'webhook-token');
    vi.stubGlobal('fetch', fetchMock);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });
  afterEach(() => vi.useRealTimers());

  it('claims a due event, sends it once with its idempotency key and marks it delivered', async () => {
    seed();
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    await expect(deliverOutboxEvent(EVENT_ID)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://hooks.example.test/check-in');
    expect(init.headers).toMatchObject({ 'Idempotency-Key': EVENT_ID, Authorization: 'Bearer webhook-token' });
    expect(JSON.parse(String(init.body))).toEqual({
      event: 'check_in_time_request.created',
      eventId: EVENT_ID,
      requestId: CHECK_IN_ID,
      bookingId: BOOKING_ID,
      userId: USER_ID,
      guestName: 'Ada Lovelace',
      guestEmail: 'ada@example.test',
      guestPhone: '+306912345678',
      requestedTime: '15:00',
      message: 'Arriving by ferry',
      status: 'PENDING',
      occurredAt: NOW.toISOString(),
    });
    expect(event()).toMatchObject({ status: 'DELIVERED', attemptCount: 1, leaseOwner: null, deliveredAt: NOW });
  });

  it.each([
    ['not yet due', { nextAttemptAt: new Date(NOW.getTime() + 60_000) }],
    ['already leased by another worker', { status: 'LEASED', leaseOwner: 'other-worker' }],
    ['already delivered', { status: 'DELIVERED' }],
    ['dead', { status: 'DEAD' }],
  ])('does not send an event that is %s', async (_label, overrides) => {
    seed(overrides);

    await expect(deliverOutboxEvent(EVENT_ID)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('backs off exponentially after a failed attempt', async () => {
    seed({ attemptCount: 3 });
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));

    await expect(deliverOutboxEvent(EVENT_ID)).resolves.toBe(false);

    // Fourth attempt: 2^(4-1) = 8 minutes.
    expect(event()).toMatchObject({ status: 'PENDING', attemptCount: 4, leaseOwner: null, lastError: 'Webhook responded with 500' });
    expect((event().nextAttemptAt as Date).getTime()).toBe(NOW.getTime() + 8 * 60_000);
  });

  it('marks the event DEAD after the tenth attempt', async () => {
    seed({ attemptCount: 9 });
    fetchMock.mockRejectedValue(new TypeError('connect ECONNREFUSED'));

    await deliverOutboxEvent(EVENT_ID);

    expect(event()).toMatchObject({ status: 'DEAD', attemptCount: 10, leaseOwner: null, lastError: 'connect ECONNREFUSED' });
  });

  it('does not record a delivery for a lease it no longer owns', async () => {
    seed();
    fetchMock.mockImplementation(async () => {
      // Another worker recovered and re-leased the event while the webhook was running.
      event().leaseOwner = 'another-worker';
      return new Response('', { status: 200 });
    });

    await expect(deliverOutboxEvent(EVENT_ID)).resolves.toBe(false);

    expect(event()).toMatchObject({ status: 'LEASED', leaseOwner: 'another-worker', deliveredAt: null });
  });

  it('ignores an unsupported destination without claiming it', async () => {
    seed({ destination: 'unknown_destination' });

    await expect(deliverOutboxEvent(EVENT_ID)).resolves.toBe(false);
    expect(event().status).toBe('PENDING');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recovers an abandoned lease and delivers the event in the next drain', async () => {
    seed({ status: 'LEASED', leaseOwner: 'crashed-worker', leaseExpiresAt: new Date(NOW.getTime() - 1_000), attemptCount: 1 });
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    await expect(drainOutbox(10)).resolves.toEqual({ attempted: 1, delivered: 1 });

    expect(event()).toMatchObject({ status: 'DELIVERED', attemptCount: 2 });
  });

  it('leaves a live lease alone during a drain', async () => {
    seed({ status: 'LEASED', leaseOwner: 'busy-worker', leaseExpiresAt: new Date(NOW.getTime() + 60_000) });

    await expect(drainOutbox(10)).resolves.toEqual({ attempted: 0, delivered: 0 });
    expect(event()).toMatchObject({ status: 'LEASED', leaseOwner: 'busy-worker' });
  });

  it('never claims a leftover booking-request event', async () => {
    seedLeftoverBookingEvent(LEFTOVER_EVENT_ID);
    const before = structuredClone(db.events.get(LEFTOVER_EVENT_ID));
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    await expect(deliverOutboxEvent(LEFTOVER_EVENT_ID)).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prismaMock.outboxEvent.updateMany).not.toHaveBeenCalled();
    expect(db.events.get(LEFTOVER_EVENT_ID)).toEqual(before);
  });

  it('neither recovers nor drains leftover booking-request events', async () => {
    seed();
    seedLeftoverBookingEvent(LEFTOVER_EVENT_ID);
    seedLeftoverBookingEvent(LEFTOVER_LEASED_EVENT_ID, {
      status: 'LEASED',
      leaseOwner: 'crashed-worker',
      leaseExpiresAt: new Date(NOW.getTime() - 1_000),
      attemptCount: 1,
    });
    const leftovers = structuredClone([db.events.get(LEFTOVER_EVENT_ID), db.events.get(LEFTOVER_LEASED_EVENT_ID)]);
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    await expect(drainOutbox(10)).resolves.toEqual({ attempted: 1, delivered: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://hooks.example.test/check-in');
    expect(event()).toMatchObject({ status: 'DELIVERED', attemptCount: 1 });
    expect([db.events.get(LEFTOVER_EVENT_ID), db.events.get(LEFTOVER_LEASED_EVENT_ID)]).toEqual(leftovers);
  });
});

// An in-process receiver on an ephemeral loopback port: `/hook` answers with a
// redirect to `/moved`, which would answer 200. It records every request, so a
// test can prove the redirect target was never contacted.
async function startRedirectingReceiver(redirectStatus: number) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    request.resume();
    if (request.url === '/hook') response.writeHead(redirectStatus, { location: '/moved' }).end();
    else response.writeHead(200).end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: `http://${host}/hook`,
    host,
    requests,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

describe('check-in outbox delivery to a redirecting receiver', () => {
  const TOKEN = 'redirect-webhook-token';
  let receiver: Awaited<ReturnType<typeof startRedirectingReceiver>> | undefined;

  beforeEach(() => {
    db.events.clear();
    db.checkInRequests.clear();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });
  afterEach(async () => {
    await receiver?.close();
    receiver = undefined;
  });

  it.each([302, 307])('records a %i redirect as a failed attempt and never requests the redirect target', async (status) => {
    receiver = await startRedirectingReceiver(status);
    vi.stubEnv('CHECKIN_REQUEST_WEBHOOK_URL', receiver.url);
    vi.stubEnv('CHECKIN_REQUEST_WEBHOOK_TOKEN', TOKEN);
    seed({ nextAttemptAt: new Date(Date.now() - 1_000) });

    await expect(deliverOutboxEvent(EVENT_ID)).resolves.toBe(false);

    expect(receiver.requests).toEqual(['POST /hook']);
    expect(event()).toMatchObject({ status: 'PENDING', attemptCount: 1, leaseOwner: null, deliveredAt: null });
    expect(event().lastError).toEqual(expect.any(String));
    expect(event().lastError).not.toContain(receiver.host);
    expect(event().lastError).not.toContain(TOKEN);
  });
});
