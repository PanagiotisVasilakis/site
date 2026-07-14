const prismaMock = vi.hoisted(() => ({
  webhookOutbox: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  stayRequest: { update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: { warn: vi.fn() } }));

import { deliverBookingOutboxEvent, drainBookingOutbox } from './bookingOutbox';

const event = {
  id: 'event-1',
  eventType: 'stay_request.created',
  stayRequestId: 'request-1',
  attemptCount: 1,
  createdAt: new Date('2026-07-14T10:00:00Z'),
  stayRequest: { id: 'request-1', email: 'guest@example.com' },
};

describe('booking outbox delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOOKING_REQUEST_WEBHOOK_URL = 'https://hooks.example.test/bookings';
    delete process.env.BOOKING_REQUEST_WEBHOOK_TOKEN;
    prismaMock.webhookOutbox.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.webhookOutbox.findUnique.mockResolvedValue(event);
    prismaMock.webhookOutbox.update.mockReturnValue({ operation: 'outbox-update' });
    prismaMock.stayRequest.update.mockReturnValue({ operation: 'request-update' });
    prismaMock.$transaction.mockResolvedValue([]);
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

    await expect(deliverBookingOutboxEvent(event.id)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      process.env.BOOKING_REQUEST_WEBHOOK_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer webhook-secret' }),
      }),
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.webhookOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) }),
    );
  });

  it('returns without claiming work when delivery is not configured', async () => {
    delete process.env.BOOKING_REQUEST_WEBHOOK_URL;
    await expect(deliverBookingOutboxEvent(event.id)).resolves.toBe(false);
    expect(prismaMock.webhookOutbox.updateMany).not.toHaveBeenCalled();
  });

  it('schedules a bounded retry after a webhook failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(deliverBookingOutboxEvent(event.id)).resolves.toBe(false);
    expect(prismaMock.webhookOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', lastError: 'Webhook responded with 503' }),
      }),
    );
    expect(prismaMock.stayRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDING' } }),
    );
  });

  it('recovers abandoned leases and caps the requested batch size', async () => {
    prismaMock.webhookOutbox.findMany.mockResolvedValue([]);
    await expect(drainBookingOutbox(500)).resolves.toEqual({ attempted: 0, delivered: 0 });
    expect(prismaMock.webhookOutbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PROCESSING' }) }),
    );
    expect(prismaMock.webhookOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});
