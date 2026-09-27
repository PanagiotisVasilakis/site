import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  verifyGuestSessionAccess: vi.fn(),
  settingFind: vi.fn(),
  settingUpsert: vi.fn(),
  bookingFind: vi.fn(),
  createRequest: vi.fn(),
}));

vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: async () => ({ checkinEnabled: true }) }));
vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/guestSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/guestSession')>()),
  parseGuestSession: () => ({ sessionId: 'session' }),
  verifyGuestSessionAccess: mocks.verifyGuestSessionAccess,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    operationalSetting: { findUnique: mocks.settingFind, upsert: mocks.settingUpsert },
    booking: { findUnique: mocks.bookingFind },
  },
}));
vi.mock('@/lib/prisma-repositories/checkInRequestRepository', () => ({
  checkInRequestRepository: { create: mocks.createRequest },
}));

import { GET as getPreferences, POST as postPreferences } from '@/app/api/check-in/preferences/route';
import { POST as postArrivalRequest } from '@/app/api/check-in/arrival-request/route';

const BOOKING_ID = 'c6a502d6-6dd2-4a03-811e-694114f3122a';

function request(path: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, body === undefined
    ? { headers: { cookie: 'guest_session=signed' } }
    : {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'guest_session=signed' },
      body: JSON.stringify(body),
    });
}

describe('check-in time format', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(false);
    mocks.verifyGuestSessionAccess.mockResolvedValue({ booking: { id: BOOKING_ID }, user: { id: 'user' } });
    mocks.bookingFind.mockResolvedValue({ startDate: new Date('2030-06-01T00:00:00.000Z'), endDate: new Date('2030-06-05T00:00:00.000Z') });
  });

  it('serves the defaults instead of failing when a stored time is not zero-padded', async () => {
    mocks.settingFind.mockResolvedValue({ value: { checkInTime: '9:00', checkOutTime: '11:00' }, updatedAt: new Date() });

    const response = await getPreferences(request('/api/check-in/preferences'), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ checkInTime: '15:00', checkOutTime: '11:00' });
  });

  it.each(['9:00', '24:00', '09:60'])('refuses to store the check-in time %s', async (checkInTime) => {
    mocks.isAdminRequest.mockResolvedValue(true);

    const response = await postPreferences(request('/api/check-in/preferences', { checkInTime, checkOutTime: '11:00' }), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    expect(mocks.settingUpsert).not.toHaveBeenCalled();
  });

  it('stores zero-padded times', async () => {
    mocks.isAdminRequest.mockResolvedValue(true);

    const response = await postPreferences(request('/api/check-in/preferences', { checkInTime: '09:00', checkOutTime: '11:00' }), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.settingUpsert).toHaveBeenCalledTimes(1);
  });

  it('refuses an arrival request time that is not zero-padded', async () => {
    const response = await postArrivalRequest(request('/api/check-in/arrival-request', { requestedTime: '9:30' }), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });
});
