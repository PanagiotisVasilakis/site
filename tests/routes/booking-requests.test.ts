import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rateLimitTransaction: vi.fn(),
  rateLimitQuery: vi.fn(),
  stayRequestFindUnique: vi.fn(),
  stayRequestCreate: vi.fn(),
  deliverOutboxEvent: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.rateLimitTransaction,
    stayRequest: { findUnique: mocks.stayRequestFindUnique, create: mocks.stayRequestCreate },
  },
}));
vi.mock('@/lib/bookingOutbox', () => ({ deliverOutboxEvent: mocks.deliverOutboxEvent }));

import { POST } from '@/app/api/booking-requests/route';

const ATTESTATION = 'c'.repeat(64);

function submit(dateRange: { from: string; to: string }, idempotencyKey = 'booking-request-key-0001'): Promise<Response> {
  return POST(new NextRequest('http://localhost:3000/api/booking-requests', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
      'x-origin-proxy-attestation': ATTESTATION,
      'x-origin-verified-client-ip': '203.0.113.20',
    },
    body: JSON.stringify({
      propertyName: 'Test Apartment',
      locale: 'en',
      dateRange,
      guest: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', phone: '+30 694 111 2222' },
    }),
  }));
}

describe('booking request calendar dates', () => {
  beforeEach(() => {
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', ATTESTATION);
    vi.stubEnv('BOOKING_REQUEST_WEBHOOK_URL', 'https://hooks.example.test/booking');
    mocks.rateLimitQuery.mockResolvedValue([{ count: 1, reset_time: new Date(Date.now() + 60_000) }]);
    mocks.rateLimitTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ $queryRaw: mocks.rateLimitQuery }));
    mocks.stayRequestFindUnique.mockResolvedValue(null);
    mocks.stayRequestCreate.mockResolvedValue({});
    mocks.deliverOutboxEvent.mockResolvedValue(true);
  });

  it.each(['Europe/Athens', 'America/New_York', 'UTC'])(
    'stores the selected dates as UTC midnight whatever the process time zone (%s)',
    async (timeZone) => {
      vi.stubEnv('TZ', timeZone);

      const response = await submit({ from: '2026-11-01', to: '2026-11-05' });

      expect(response.status).toBe(202);
      const data = mocks.stayRequestCreate.mock.calls[0][0].data as { startDate: Date; endDate: Date };
      expect(data.startDate.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(data.endDate.toISOString()).toBe('2026-11-05T00:00:00.000Z');
    },
  );

  it.each([
    ['instants instead of calendar dates', { from: '2026-10-31T22:00:00.000Z', to: '2026-11-04T22:00:00.000Z' }],
    ['a check-out on the check-in day', { from: '2026-11-01', to: '2026-11-01' }],
    ['a check-out before check-in', { from: '2026-11-05', to: '2026-11-01' }],
    ['an impossible calendar date', { from: '2026-02-30', to: '2026-03-02' }],
  ])('rejects %s with 422 before any write', async (_label, dateRange) => {
    const response = await submit(dateRange);

    expect(response.status).toBe(422);
    expect(mocks.stayRequestCreate).not.toHaveBeenCalled();
  });

  describe('idempotent replay', () => {
    const stored = {
      id: '80000000-0000-4000-8000-000000000001',
      status: 'DELIVERED',
      propertyName: 'Test Apartment',
      locale: 'en',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-11-05T00:00:00.000Z'),
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      phone: '+306941112222',
      arrivalTime: null,
      specialRequests: null,
    };

    it('returns the original request for the same payload', async () => {
      mocks.stayRequestFindUnique.mockResolvedValue(stored);

      const response = await submit({ from: '2026-11-01', to: '2026-11-05' });

      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual({ id: stored.id, status: 'delivered' });
      expect(mocks.stayRequestCreate).not.toHaveBeenCalled();
    });

    it('refuses the same key for a different payload with 422', async () => {
      mocks.stayRequestFindUnique.mockResolvedValue({ ...stored, firstName: 'Grace' });

      const response = await submit({ from: '2026-11-01', to: '2026-11-05' });

      expect(response.status).toBe(422);
      expect(JSON.stringify(await response.json())).toContain('already used for a different booking request');
      expect(mocks.stayRequestCreate).not.toHaveBeenCalled();
    });

    it('applies the same check when a concurrent request wins the key', async () => {
      mocks.stayRequestFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...stored, endDate: new Date('2026-11-06T00:00:00.000Z') });
      mocks.stayRequestCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      const response = await submit({ from: '2026-11-01', to: '2026-11-05' });

      expect(response.status).toBe(422);
      expect(mocks.deliverOutboxEvent).not.toHaveBeenCalled();
    });
  });
});
