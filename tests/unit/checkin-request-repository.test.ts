import { beforeEach, describe, expect, it, vi } from 'vitest';

type OutboxStatus = 'PENDING' | 'LEASED' | 'DELIVERED' | 'DEAD';
type ListedEvent = { status: OutboxStatus; payload: unknown };
type ListArgs = { include: { outboxEvents: { take?: number } } };

type StoredEvent = {
  id: string;
  checkInRequestId: string;
  status: OutboxStatus;
  payload: unknown;
  attemptCount: number;
};
type EventWhere = {
  checkInRequestId?: string;
  status?: OutboxStatus;
  payload?: { path: string[]; equals: boolean };
  id?: { notIn: string[] };
};

const prismaMock = vi.hoisted(() => ({
  checkInRequest: { findMany: vi.fn<(args: ListArgs) => Promise<unknown[]>>() },
  outboxEvent: {
    findMany: vi.fn<(args: { where: EventWhere }) => Promise<{ id: string }[]>>(),
    updateMany: vi.fn<(args: { where: EventWhere; data: Record<string, unknown> }) => Promise<{ count: number }>>(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import { checkInRequestRepository } from '@/lib/prisma-repositories/checkInRequestRepository';

const REQUEST_ID = '79100000-0000-4000-8000-000000000001';
const OTHER_REQUEST_ID = '79100000-0000-4000-8000-000000000002';

const createdEvent = (status: OutboxStatus): ListedEvent => ({ status, payload: { previousStatus: null, status: 'PENDING' } });
const decisionEvent = (status: OutboxStatus): ListedEvent => ({ status, payload: { previousStatus: 'PENDING', status: 'APPROVED' } });
const ERASURE_PAYLOAD = { redacted: true, reason: 'privacy_erasure' };

// The events are given newest first, as the repository asks for them. Like the
// database, the fake honours `take`, so a query that limits the events to one
// hides the older ones again.
async function notificationStatusOf(events: ListedEvent[]) {
  prismaMock.checkInRequest.findMany.mockImplementation(async ({ include }) => [{
    id: REQUEST_ID,
    bookingId: null,
    userId: null,
    guestName: null,
    guestEmail: null,
    guestPhone: null,
    requestedTime: '17:00',
    message: null,
    status: 'APPROVED',
    createdAt: new Date(),
    updatedAt: new Date(),
    outboxEvents: events.slice(0, include.outboxEvents.take),
  }]);
  const { requests } = await checkInRequestRepository.list();
  return requests[0].notification_status;
}

describe('admin request list: notification status', () => {
  it('reports a DEAD created notification hidden behind a newer delivered decision', async () => {
    const status = await notificationStatusOf([decisionEvent('DELIVERED'), createdEvent('DEAD')]);

    expect(status).toBe('DEAD');
  });

  const nothingFailed: [string, ListedEvent[], OutboxStatus | undefined][] = [
    ['no outbox event', [], undefined],
    ['one pending event', [createdEvent('PENDING')], 'PENDING'],
    ['a leased decision over a delivered created event', [decisionEvent('LEASED'), createdEvent('DELIVERED')], 'LEASED'],
    ['two delivered events', [decisionEvent('DELIVERED'), createdEvent('DELIVERED')], 'DELIVERED'],
    ['a pending decision over a delivered created event', [decisionEvent('PENDING'), createdEvent('DELIVERED')], 'PENDING'],
  ];

  it.each(nothingFailed)('reports the newest status when nothing failed: %s', async (_label, events, expected) => {
    expect(await notificationStatusOf(events)).toBe(expected);
  });

  it.each([
    ['a payload without a redacted key', { previousStatus: null, status: 'PENDING' }],
    ['redacted: false', { requestId: 'b', redacted: false }],
  ])('still reports an older DEAD event with %s', async (_label, payload) => {
    const status = await notificationStatusOf([decisionEvent('DELIVERED'), { status: 'DEAD', payload }]);

    expect(status).toBe('DEAD');
  });

  it('does not report an erasure-cancelled DEAD event as a failed notification', async () => {
    const status = await notificationStatusOf([
      decisionEvent('DELIVERED'),
      { status: 'DEAD', payload: ERASURE_PAYLOAD },
    ]);

    expect(status).toBe('DELIVERED');
  });

  it('reports a genuine DEAD event that sits behind an erasure-cancelled one', async () => {
    const status = await notificationStatusOf([
      { status: 'DEAD', payload: ERASURE_PAYLOAD },
      createdEvent('DEAD'),
    ]);

    expect(status).toBe('DEAD');
  });

  it('reports no status when an erasure cancelled the only event', async () => {
    const status = await notificationStatusOf([{ status: 'DEAD', payload: ERASURE_PAYLOAD }]);

    expect(status).toBeUndefined();
  });

  it('reports the newest status that an erasure did not cancel', async () => {
    const status = await notificationStatusOf([
      { status: 'DEAD', payload: ERASURE_PAYLOAD },
      createdEvent('DELIVERED'),
    ]);

    expect(status).toBe('DELIVERED');
  });

  it('asks for every outbox event of a request, newest first', async () => {
    await notificationStatusOf([]);

    expect(prismaMock.checkInRequest.findMany.mock.calls[0][0].include).toEqual({
      outboxEvents: { orderBy: { createdAt: 'desc' }, select: { status: true, payload: true } },
    });
  });
});

describe('retryFailedNotifications', () => {
  let store: StoredEvent[];

  const stored = (
    id: string,
    status: OutboxStatus,
    payload: unknown,
    checkInRequestId = REQUEST_ID,
  ): StoredEvent => ({ id, checkInRequestId, status, payload, attemptCount: 10 });

  // Evaluates only the filters the repository is expected to use and throws on
  // anything else, so a changed query shape cannot pass silently.
  function matches(event: StoredEvent, where: EventWhere): boolean {
    const { checkInRequestId, status, payload, id, ...unsupported } = where;
    if (Object.keys(unsupported).length > 0) {
      throw new Error(`The fake cannot evaluate: ${Object.keys(unsupported).join(', ')}`);
    }
    if (checkInRequestId !== undefined && event.checkInRequestId !== checkInRequestId) return false;
    if (status !== undefined && event.status !== status) return false;
    if (payload !== undefined) {
      if (payload.path.length !== 1 || payload.path[0] !== 'redacted') throw new Error('The fake supports only the redacted path');
      const redacted = (event.payload as Record<string, unknown> | null)?.redacted;
      if (redacted !== payload.equals) return false;
    }
    if (id !== undefined && id.notIn.includes(event.id)) return false;
    return true;
  }

  beforeEach(() => {
    store = [];
    prismaMock.outboxEvent.findMany.mockImplementation(async ({ where }) =>
      store.filter((event) => matches(event, where)).map(({ id }) => ({ id })));
    prismaMock.outboxEvent.updateMany.mockImplementation(async ({ where, data }) => {
      const rows = store.filter((event) => matches(event, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    });
  });

  it('requeues a failed notification', async () => {
    store.push(stored('failed', 'DEAD', { previousStatus: null, status: 'PENDING' }));

    const count = await checkInRequestRepository.retryFailedNotifications(REQUEST_ID);

    expect(count).toBe(1);
    expect(store[0]).toMatchObject({ status: 'PENDING', attemptCount: 0 });
    // Nothing was cancelled, so the update carries no (empty) id exclusion.
    expect(prismaMock.outboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { checkInRequestId: REQUEST_ID, status: 'DEAD' },
    }));
  });

  it('never requeues an event that a privacy erasure cancelled', async () => {
    store.push(
      stored('failed', 'DEAD', { previousStatus: null, status: 'PENDING' }),
      stored('cancelled', 'DEAD', ERASURE_PAYLOAD),
      stored('delivered', 'DELIVERED', { previousStatus: 'PENDING', status: 'APPROVED' }),
      stored('other-request-failed', 'DEAD', { previousStatus: null, status: 'PENDING' }, OTHER_REQUEST_ID),
      stored('other-request-cancelled', 'DEAD', ERASURE_PAYLOAD, OTHER_REQUEST_ID),
    );

    const count = await checkInRequestRepository.retryFailedNotifications(REQUEST_ID);

    expect(count).toBe(1);
    expect(store.map(({ id, status }) => [id, status])).toEqual([
      ['failed', 'PENDING'],
      ['cancelled', 'DEAD'],
      ['delivered', 'DELIVERED'],
      ['other-request-failed', 'DEAD'],
      ['other-request-cancelled', 'DEAD'],
    ]);
    expect(store[1].payload).toEqual(ERASURE_PAYLOAD);
    expect(prismaMock.outboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { checkInRequestId: REQUEST_ID, status: 'DEAD', id: { notIn: ['cancelled'] } },
    }));
  });

  it('requeues nothing when the only DEAD event was cancelled by an erasure', async () => {
    store.push(stored('cancelled', 'DEAD', ERASURE_PAYLOAD));

    const count = await checkInRequestRepository.retryFailedNotifications(REQUEST_ID);

    expect(count).toBe(0);
    expect(store[0]).toMatchObject({ status: 'DEAD', attemptCount: 10 });
  });
});
