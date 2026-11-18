import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  verifyGuestSessionAccess: vi.fn(),
  settingFind: vi.fn(),
  settingUpsert: vi.fn(),
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
    operationalSetting: { findUnique: mocks.settingFind, upsert: mocks.settingUpsert },
    booking: { findUnique: mocks.bookingFind },
  },
}));

import { GET as getPreferences, POST as postPreferences } from '@/app/api/check-in/preferences/route';

const BOOKING_ID = 'c6a502d6-6dd2-4a03-811e-694114f3122a';

function request(body?: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/check-in/preferences', body === undefined
    ? { headers: { cookie: 'guest_session=signed', ...extraHeaders } }
    : {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'guest_session=signed', ...extraHeaders },
      body: JSON.stringify(body),
    });
}

describe('GET/POST /api/check-in/preferences time format and guards', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(false);
    mocks.verifyGuestSessionAccess.mockResolvedValue({ booking: { id: BOOKING_ID }, user: { id: 'user' } });
    mocks.bookingFind.mockResolvedValue({ startDate: new Date('2030-06-01T00:00:00.000Z'), endDate: new Date('2030-06-05T00:00:00.000Z') });
  });

  it('serves defaults when stored time is unpadded and tolerates stored updatedAt on read', async () => {
    mocks.settingFind.mockResolvedValueOnce({ value: { checkInTime: '9:00', checkOutTime: '11:00' }, updatedAt: new Date() });
    const unpadded = await getPreferences(request(), { params: Promise.resolve({}) });
    expect(unpadded.status).toBe(200);
    expect((await unpadded.json()).data).toMatchObject({ checkInTime: '15:00', checkOutTime: '11:00' });

    mocks.settingFind.mockResolvedValueOnce({ value: { checkInTime: '16:00', checkOutTime: '10:00', updatedAt: 1_700_000_000_000 }, updatedAt: new Date() });
    const strictRead = await getPreferences(request(), { params: Promise.resolve({}) });
    expect(strictRead.status).toBe(200);
    expect((await strictRead.json()).data).toMatchObject({ checkInTime: '16:00', checkOutTime: '10:00' });
  });

  it.each(['9:00', '24:00', '09:60'])('refuses to store invalid check-in time %s', async (checkInTime) => {
    mocks.isAdminRequest.mockResolvedValue(true);

    const response = await postPreferences(request({ checkInTime, checkOutTime: '11:00' }), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    expect(mocks.settingUpsert).not.toHaveBeenCalled();
  });

  it('rejects unknown POST keys, non-admin sessions, and cross-origin mutations before saving', async () => {
    const guestPost = await postPreferences(request({ checkInTime: '09:00', checkOutTime: '11:00' }), { params: Promise.resolve({}) });
    expect(guestPost.status).toBe(401);
    expect((await guestPost.json()).error.code).toBe('UNAUTHORIZED');

    mocks.isAdminRequest.mockResolvedValue(true);
    const crossOrigin = await postPreferences(
      request({ checkInTime: '09:00', checkOutTime: '11:00' }, { origin: 'https://evil.example' }),
      { params: Promise.resolve({}) },
    );
    expect(crossOrigin.status).toBe(403);

    const unknownKey = await postPreferences(
      request({ checkInTime: '16:00', checkOutTime: '11:00', updatedAt: 0 }),
      { params: Promise.resolve({}) },
    );
    expect(unknownKey.status).toBe(422);
    expect((await unknownKey.json()).error.details.validationErrors).toEqual([expect.objectContaining({ code: 'unrecognized_keys' })]);
    expect(mocks.settingUpsert).not.toHaveBeenCalled();
  });

  it('stores valid zero-padded times for admins', async () => {
    mocks.isAdminRequest.mockResolvedValue(true);

    const response = await postPreferences(request({ checkInTime: '09:00', checkOutTime: '11:00' }), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.settingUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/check-in/preferences Wi-Fi disclosure window', () => {
  const WIFI = { network: 'guest-net', password: 'guest-pass' };
  const REVEAL_AT = '2030-06-09T12:00:00.000Z';

  async function getWifi(now: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    return getPreferences(request(), { params: Promise.resolve({}) });
  }

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

  afterEach(() => vi.useRealTimers());

  it.each([
    ['one second before the window opens', '2030-06-09T11:59:59.000Z', null, true],
    ['when the window opens', REVEAL_AT, WIFI, false],
    ['at the check-out time', '2030-06-14T08:00:00.000Z', WIFI, false],
    ['one second after the check-out time', '2030-06-14T08:00:01.000Z', null, false],
  ])('%s', async (_label, now, wifi, wifiPending) => {
    const response = await getWifi(now);

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ wifi, wifiAvailableAt: REVEAL_AT, wifiPending });
  });

  it('uses stayPolicy timezone rather than PROPERTY_TIME_ZONE env', async () => {
    vi.stubEnv('PROPERTY_TIME_ZONE', 'UTC');

    expect((await (await getWifi('2030-06-09T11:59:59.000Z')).json()).data).toMatchObject({ wifi: null, wifiAvailableAt: REVEAL_AT });
    expect((await (await getWifi(REVEAL_AT)).json()).data).toMatchObject({ wifi: WIFI, wifiAvailableAt: REVEAL_AT });
    expect((await (await getWifi('2030-06-14T08:00:01.000Z')).json()).data).toMatchObject({ wifi: null });
  });

  it('always reveals Wi-Fi to admins, denies unauthenticated callers, and hides Wi-Fi without a booking', async () => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.verifyGuestSessionAccess.mockResolvedValue(null);
    const adminResponse = await getWifi('2030-01-01T00:00:00.000Z');
    expect(adminResponse.status).toBe(200);
    expect((await adminResponse.json()).data).toMatchObject({ wifi: WIFI, wifiAvailableAt: null });

    mocks.isAdminRequest.mockResolvedValue(false);
    expect((await getWifi(REVEAL_AT)).status).toBe(401);

    mocks.verifyGuestSessionAccess.mockResolvedValue({ booking: null, user: { id: 'user' } });
    const noBookingResponse = await getWifi('2030-06-12T00:00:00.000Z');
    expect(noBookingResponse.status).toBe(200);
    expect((await noBookingResponse.json()).data).toMatchObject({ wifi: null, wifiAvailableAt: null });
    expect(mocks.bookingFind).not.toHaveBeenCalled();
  });
});
