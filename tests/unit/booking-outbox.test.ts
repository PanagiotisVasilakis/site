import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the two tables the outbox touches. It supports only
// the filters and updates bookingOutbox.ts uses (equality, lte/lt, in, increment).
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ events: new Map<string, Row>(), stayRequests: new Map<string, Row>() }));

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
      return include ? { ...row, stayRequest: row.stayRequestId ? db.stayRequests.get(String(row.stayRequestId)) ?? null : null, checkInRequest: null } : { ...row };
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
  const stayRequest = {
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = db.stayRequests.get(where.id)!;
      apply(row, data);
      return row;
    }),
  };
  return { outboxEvent, stayRequest, $transaction: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { deliverOutboxEvent, drainOutbox } from '@/lib/bookingOutbox';

const NOW = new Date('2030-06-01T12:00:00.000Z');
const EVENT_ID = '81000000-0000-4000-8000-000000000001';
const STAY_ID = '81000000-0000-4000-8000-000000000002';

function seed(overrides: Row = {}) {
  db.stayRequests.set(STAY_ID, { id: STAY_ID, status: 'PENDING', firstName: 'Ada' });
  db.events.set(EVENT_ID, {
    id: EVENT_ID,
    eventType: 'booking_request.created',
    destination: 'booking_request_webhook',
    payload: { stayRequestId: STAY_ID },
    status: 'PENDING',
    attemptCount: 0,
    nextAttemptAt: new Date(NOW.getTime() - 1_000),
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: null,
    deliveredAt: null,
    createdAt: NOW,
    stayRequestId: STAY_ID,
    checkInRequestId: null,
    ...overrides,
  });
}

const event = () => db.events.get(EVENT_ID)!;
const stay = () => db.stayRequests.get(STAY_ID)!;

describe('booking outbox delivery state machine', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    db.events.clear();
    db.stayRequests.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('BOOKING_REQUEST_WEBHOOK_URL', 'https://hooks.example.test/booking');
    vi.stubEnv('BOOKING_REQUEST_WEBHOOK_TOKEN', 'webhook-token');
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
    expect(url).toBe('https://hooks.example.test/booking');
    expect(init.headers).toMatchObject({ 'Idempotency-Key': EVENT_ID, Authorization: 'Bearer webhook-token' });
    expect(JSON.parse(String(init.body))).toMatchObject({ event: 'booking_request.created', eventId: EVENT_ID, request: { id: STAY_ID } });
    expect(event()).toMatchObject({ status: 'DELIVERED', attemptCount: 1, leaseOwner: null, deliveredAt: NOW });
    expect(stay().status).toBe('DELIVERED');
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
    expect(stay().status).toBe('PENDING');
  });

  it('marks the event DEAD and the stay request DELIVERY_FAILED after the tenth attempt', async () => {
    seed({ attemptCount: 9 });
    fetchMock.mockRejectedValue(new TypeError('connect ECONNREFUSED'));

    await deliverOutboxEvent(EVENT_ID);

    expect(event()).toMatchObject({ status: 'DEAD', attemptCount: 10, lastError: 'connect ECONNREFUSED' });
    expect(stay().status).toBe('DELIVERY_FAILED');
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
    expect(stay().status).toBe('PENDING');
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
});
