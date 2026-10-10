import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  verifyGuestSessionAccess: vi.fn(),
  settingFind: vi.fn(),
  bookingFind: vi.fn(),
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
    operationalSetting: { findUnique: mocks.settingFind },
    booking: { findUnique: mocks.bookingFind },
  },
}));

import { GET as getPreferences } from '@/app/api/check-in/preferences/route';

const BOOKING_ID = 'c6a502d6-6dd2-4a03-811e-694114f3122a';
const WIFI = { network: 'guest-net', password: 'guest-pass' };

// Stay 2030-06-10..2030-06-14 with the default 15:00 / 11:00 in Athens (UTC+3 in June):
// the details show from 2030-06-09T12:00:00Z (24 h before check-in) until 2030-06-14T08:00:00Z (check-out).
const REVEAL_AT = '2030-06-09T12:00:00.000Z';

async function getWifi(now: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  const response = await getPreferences(
    new NextRequest('http://localhost:3000/api/check-in/preferences', { headers: { cookie: 'guest_session=signed' } }),
    { params: Promise.resolve({}) },
  );
  return response;
}

describe('GET /api/check-in/preferences Wi-Fi window', () => {
  beforeEach(() => {
    vi.stubEnv('GUEST_WIFI_NETWORK', WIFI.network);
    vi.stubEnv('GUEST_WIFI_PASSWORD', WIFI.password);
    mocks.isAdminRequest.mockResolvedValue(false);
    mocks.verifyGuestSessionAccess.mockResolvedValue({ booking: { id: BOOKING_ID }, user: { id: 'user' } });
    mocks.settingFind.mockResolvedValue(null);
    mocks.bookingFind.mockResolvedValue({
      startDate: new Date('2030-06-10T00:00:00.000Z'),
      endDate: new Date('2030-06-14T00:00:00.000Z'),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['one second before the window opens', '2030-06-09T11:59:59.000Z', null],
    ['when the window opens', REVEAL_AT, WIFI],
    ['inside the window', '2030-06-12T00:00:00.000Z', WIFI],
    ['at the check-out time', '2030-06-14T08:00:00.000Z', WIFI],
    ['one second after the check-out time', '2030-06-14T08:00:01.000Z', null],
  ])('%s', async (_label, now, wifi) => {
    const response = await getWifi(now);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ wifi, wifiAvailableAt: REVEAL_AT, canEdit: false });
  });

  it('uses the stayPolicy property time zone, not the PROPERTY_TIME_ZONE environment variable', async () => {
    vi.stubEnv('PROPERTY_TIME_ZONE', 'UTC');

    const before = await getWifi('2030-06-09T11:59:59.000Z');
    expect((await before.json()).data).toMatchObject({ wifi: null, wifiAvailableAt: REVEAL_AT });

    const open = await getWifi(REVEAL_AT);
    expect((await open.json()).data).toMatchObject({ wifi: WIFI, wifiAvailableAt: REVEAL_AT });

    const after = await getWifi('2030-06-14T08:00:01.000Z');
    expect((await after.json()).data).toMatchObject({ wifi: null });
  });

  it('always shows the details to an admin, without a booking lookup', async () => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.verifyGuestSessionAccess.mockResolvedValue(null);

    const response = await getWifi('2030-01-01T00:00:00.000Z');

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ wifi: WIFI, canEdit: true, wifiAvailableAt: null });
    expect(mocks.bookingFind).not.toHaveBeenCalled();
  });

  it('answers 401 when there is neither an admin nor a guest session', async () => {
    mocks.verifyGuestSessionAccess.mockResolvedValue(null);

    const response = await getWifi(REVEAL_AT);

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
    expect(mocks.bookingFind).not.toHaveBeenCalled();
  });

  it('gives a guest session without a booking no details', async () => {
    mocks.verifyGuestSessionAccess.mockResolvedValue({ booking: null, user: { id: 'user' } });

    const response = await getWifi('2030-06-12T00:00:00.000Z');

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ wifi: null, wifiAvailableAt: null, canEdit: false });
    expect(mocks.bookingFind).not.toHaveBeenCalled();
  });
});
