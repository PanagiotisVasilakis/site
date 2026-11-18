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

const prismaMock = vi.hoisted(() => {
  const tx = {
    checkInRequest: { findUnique: vi.fn(), update: vi.fn() },
    outboxEvent: { create: vi.fn() },
  };
  return {
    tx,
    $transaction: vi.fn(),
    checkInRequest: { findMany: vi.fn<(args: ListArgs) => Promise<unknown[]>>() },
    outboxEvent: {
      findMany: vi.fn<(args: { where: EventWhere }) => Promise<{ id: string }[]>>(),
      updateMany: vi.fn<(args: { where: EventWhere; data: Record<string, unknown> }) => Promise<{ count: number }>>(),
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  CheckInRequestAlreadyDecidedError,
  checkInRequestRepository,
} from '@/lib/prisma-repositories/checkInRequestRepository';

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

  it('reports the newest status when nothing failed: a leased decision over a delivered created event', async () => {
    expect(await notificationStatusOf([decisionEvent('LEASED'), createdEvent('DELIVERED')])).toBe('LEASED');
  });

  it('still reports an older DEAD event with redacted: false', async () => {
    const status = await notificationStatusOf([decisionEvent('DELIVERED'), { status: 'DEAD', payload: { requestId: 'b', redacted: false } }]);

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
});

describe('arrival request decisions', () => {
  const decisionRow = (status: string) => ({
    id: REQUEST_ID,
    bookingId: null,
    userId: null,
    guestName: null,
    guestEmail: null,
    guestPhone: null,
    requestedTime: '17:00',
    message: null,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    vi.stubEnv('CHECKIN_REQUEST_WEBHOOK_URL', 'http://127.0.0.1:3999/hook');
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof prismaMock.tx) => unknown) => callback(prismaMock.tx));
    prismaMock.tx.checkInRequest.update.mockImplementation(async ({ data }: { data: { status: string } }) => decisionRow(data.status));
  });

  it('approves a pending request and queues one notification', async () => {
    prismaMock.tx.checkInRequest.findUnique.mockResolvedValue(decisionRow('PENDING'));

    const result = await checkInRequestRepository.updateStatus(REQUEST_ID, 'APPROVED');

    expect(result.changed).toBe(true);
    expect(prismaMock.tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('refuses to reverse a decision and treats repeating the same decision as unchanged', async () => {
    prismaMock.tx.checkInRequest.findUnique.mockResolvedValue(decisionRow('APPROVED'));
    await expect(checkInRequestRepository.updateStatus(REQUEST_ID, 'REJECTED')).rejects.toBeInstanceOf(CheckInRequestAlreadyDecidedError);
    expect(prismaMock.tx.checkInRequest.update).not.toHaveBeenCalled();

    prismaMock.tx.checkInRequest.findUnique.mockResolvedValue(decisionRow('REJECTED'));
    const result = await checkInRequestRepository.updateStatus(REQUEST_ID, 'REJECTED');
    expect(result.changed).toBe(false);
    expect(prismaMock.tx.outboxEvent.create).not.toHaveBeenCalled();
  });
});
