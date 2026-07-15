const prismaMock = vi.hoisted(() => ({
  outboxEvent: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  stayRequest: { update: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: { warn: vi.fn() } }));

import { deliverOutboxEvent, drainOutbox } from './bookingOutbox';

type EventFixture = {
  id: string;
  eventType: string;
  destination: string;
  stayRequestId: string | null;
  attemptCount: number;
  payload: Record<string, unknown>;
  createdAt: Date;
  stayRequest: Record<string, unknown> | null;
  checkInRequest: Record<string, unknown> | null;
};

const event: EventFixture = {
  id: 'event-1',
  eventType: 'stay_request.created',
  destination: 'booking_request_webhook',
  stayRequestId: 'request-1',
  attemptCount: 1,
  payload: { stayRequestId: 'request-1' },
  createdAt: new Date('2026-07-14T10:00:00Z'),
  stayRequest: { id: 'request-1', email: 'guest@example.com' },
  checkInRequest: null,
};

describe('booking outbox delivery', () => {
  let activeEvent: EventFixture = event;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOOKING_REQUEST_WEBHOOK_URL = 'https://hooks.example.test/bookings';
    delete process.env.BOOKING_REQUEST_WEBHOOK_TOKEN;
    activeEvent = event;
    prismaMock.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.outboxEvent.findUnique.mockImplementation(async (args: { select?: Record<string, unknown> }) => {
      if (args.select?.attemptCount) return { attemptCount: activeEvent.attemptCount };
      if (args.select?.destination) {
        return { destination: activeEvent.destination, stayRequestId: activeEvent.stayRequestId };
      }
      return {
        ...activeEvent,
        status: 'LEASED',
        leaseOwner: prismaMock.outboxEvent.updateMany.mock.calls[0]?.[0]?.data?.leaseOwner,
      };
    });
    prismaMock.$queryRaw.mockResolvedValue([{ id: event.id }]);
    prismaMock.stayRequest.update.mockResolvedValue({ id: 'request-1' });
    prismaMock.$transaction.mockImplementation(async (callback: unknown) => {
      if (typeof callback === 'function') return callback(prismaMock);
      return [];
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BOOKING_REQUEST_WEBHOOK_URL;
    delete process.env.BOOKING_REQUEST_WEBHOOK_TOKEN;
  });

  it('claims and atomically marks a successful webhook delivery', async () => {
    process.env.BOOKING_REQUEST_WEBHOOK_TOKEN = 'webhook-secret';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(deliverOutboxEvent(event.id)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      process.env.BOOKING_REQUEST_WEBHOOK_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer webhook-secret' }),
      }),
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'LEASED' }),
        data: expect.objectContaining({ status: 'DELIVERED' }),
      }),
    );
  });

  it('backs off durably when delivery is not configured', async () => {
    delete process.env.BOOKING_REQUEST_WEBHOOK_URL;
    await expect(deliverOutboxEvent(event.id)).resolves.toBe(false);
    expect(prismaMock.outboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', lastError: 'Webhook destination is not configured' }),
    }));
  });

  it('schedules a bounded retry after a webhook failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(deliverOutboxEvent(event.id)).resolves.toBe(false);
    expect(prismaMock.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', lastError: 'Webhook responded with 503' }),
      }),
    );
    expect(prismaMock.stayRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDING' } }),
    );
  });

  it('recovers abandoned leases and caps the requested batch size', async () => {
    prismaMock.outboxEvent.findMany.mockResolvedValue([]);
    await expect(drainOutbox(500)).resolves.toEqual({ attempted: 0, delivered: 0 });
    expect(prismaMock.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'LEASED' }) }),
    );
    expect(prismaMock.outboxEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          destination: { in: ['booking_request_webhook', 'checkin_request_webhook'] },
        }),
        take: 100,
      }),
    );
  });

  it('does not mutate the stay request after losing the delivery lease', async () => {
    prismaMock.outboxEvent.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await expect(deliverOutboxEvent(event.id)).resolves.toBe(false);
    expect(prismaMock.stayRequest.update).not.toHaveBeenCalled();
  });

  it('delivers a check-in event without changing its business status', async () => {
    process.env.CHECKIN_REQUEST_WEBHOOK_URL = 'https://hooks.example.test/check-in';
    const checkInEvent = {
      ...event,
      eventType: 'check_in_time_request.updated',
      destination: 'checkin_request_webhook',
      stayRequestId: null,
      stayRequest: null,
      payload: { previousStatus: 'PENDING', status: 'APPROVED' },
      checkInRequest: {
        id: 'check-in-1',
        bookingId: 'booking-1',
        userId: 'user-1',
        guestName: 'Guest',
        guestEmail: 'guest@example.test',
        guestPhone: '+306900000000',
        requestedTime: '13:30',
        message: null,
        status: 'APPROVED',
      },
    };
    activeEvent = checkInEvent;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(deliverOutboxEvent(checkInEvent.id)).resolves.toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      event: 'check_in_time_request.updated',
      previousStatus: 'PENDING',
      status: 'APPROVED',
      requestId: 'check-in-1',
    });
    expect(prismaMock.stayRequest.update).not.toHaveBeenCalled();
    delete process.env.CHECKIN_REQUEST_WEBHOOK_URL;
  });
});
