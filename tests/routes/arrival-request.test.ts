import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flags: vi.fn(),
  verifyGuestSessionAccess: vi.fn(),
  findUserById: vi.fn(),
  create: vi.fn(),
  findLatestForGuest: vi.fn(),
  deliverOutboxEvent: vi.fn(),
  findBooking: vi.fn(),
}));

vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: mocks.flags }));
vi.mock('@/lib/guestSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/guestSession')>()),
  parseGuestSession: () => ({ type: 'guest', sid: 'session' }),
  verifyGuestSessionAccess: mocks.verifyGuestSessionAccess,
}));
vi.mock('@/lib/guestDataStore', () => ({ guestStore: { findUserById: mocks.findUserById } }));
vi.mock('@/lib/prisma-repositories/checkInRequestRepository', () => ({
  checkInRequestRepository: { create: mocks.create, findLatestForGuest: mocks.findLatestForGuest },
}));
vi.mock('@/lib/bookingOutbox', () => ({ deliverOutboxEvent: mocks.deliverOutboxEvent }));
vi.mock('@/lib/prisma', () => ({ prisma: { booking: { findUnique: mocks.findBooking } } }));

import { GET, POST } from '@/app/api/check-in/arrival-request/route';

const BOOKING_ID = '82000000-0000-4000-8000-000000000001';
const USER_ID = '82000000-0000-4000-8000-000000000002';
const NOW = new Date('2030-06-10T12:00:00.000Z');

const record = (requestedTime: string) => ({
  id: '82000000-0000-4000-8000-000000000003', booking_id: BOOKING_ID, user_id: USER_ID,
  requested_time: requestedTime, status: 'PENDING', created_at: Date.now(), updated_at: Date.now(),
});

function post(body: unknown) {
  return POST(new NextRequest('http://localhost:3000/api/check-in/arrival-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'guest_session=signed' },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({}) });
}

describe('arrival-time request route', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.flags.mockResolvedValue({ portalEnabled: true, checkinEnabled: true });
    mocks.verifyGuestSessionAccess.mockResolvedValue({ booking: { id: BOOKING_ID }, user: { id: USER_ID } });
    mocks.findUserById.mockResolvedValue({ phoneE164: '+306912345678' });
    mocks.findBooking.mockResolvedValue({ startDate: new Date('2030-06-12T00:00:00.000Z') });
  });
  afterEach(() => vi.useRealTimers());

  it('stores the request for the verified booking and delivers its notification', async () => {
    mocks.create.mockResolvedValue({ request: record('17:00'), notificationEventId: 'event-1', created: true });
    mocks.deliverOutboxEvent.mockResolvedValue(true);

    const response = await post({ requestedTime: '17:00', message: '  Late flight  ' });

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: BOOKING_ID, userId: USER_ID, requestedTime: '17:00', message: 'Late flight', guestPhone: '+306912345678' }),
      expect.objectContaining({ eventType: 'check_in_time_request.created', nextStatus: 'PENDING' }),
    );
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('guestEmail');
    expect((await response.json()).data).toMatchObject({ request: { requestedTime: '17:00', status: 'pending' }, notification: { status: 'sent' } });
  });

  it('reports a request that was kept because one is already pending', async () => {
    mocks.create.mockResolvedValue({ request: record('16:30'), created: false });

    const response = await post({ requestedTime: '17:00' });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      request: { requestedTime: '16:30' },
      notification: { status: 'skipped', reason: 'request_already_pending' },
    });
    expect(mocks.deliverOutboxEvent).not.toHaveBeenCalled();
  });

  it('refuses a new request once the check-in date has passed', async () => {
    mocks.findBooking.mockResolvedValue({ startDate: new Date('2030-06-09T00:00:00.000Z') });

    const response = await post({ requestedTime: '17:00' });

    expect(response.status).toBe(409);
    expect(mocks.findBooking).toHaveBeenCalledWith({ where: { id: BOOKING_ID }, select: { startDate: true } });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.deliverOutboxEvent).not.toHaveBeenCalled();
  });

  it('still accepts a request on the check-in date', async () => {
    mocks.findBooking.mockResolvedValue({ startDate: new Date('2030-06-10T00:00:00.000Z') });
    mocks.create.mockResolvedValue({ request: record('17:00'), notificationEventId: 'event-1', created: true });
    mocks.deliverOutboxEvent.mockResolvedValue(true);

    const response = await post({ requestedTime: '17:00' });

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('returns the latest request of the verified guest', async () => {
    mocks.findLatestForGuest.mockResolvedValue(record('18:15'));

    const response = await GET(new NextRequest('http://localhost:3000/api/check-in/arrival-request', {
      headers: { cookie: 'guest_session=signed' },
    }), { params: Promise.resolve({}) });

    expect(mocks.findLatestForGuest).toHaveBeenCalledWith({ bookingId: BOOKING_ID, userId: USER_ID });
    expect((await response.json()).data.request).toMatchObject({ requestedTime: '18:15', status: 'pending' });
  });

  it('requires a verified guest session', async () => {
    mocks.verifyGuestSessionAccess.mockResolvedValue(null);

    expect((await post({ requestedTime: '17:00' })).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('is not found while check-in is switched off', async () => {
    mocks.flags.mockResolvedValue({ portalEnabled: true, checkinEnabled: false });

    expect((await post({ requestedTime: '17:00' })).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
