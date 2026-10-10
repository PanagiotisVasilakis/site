import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ parseGuestSession: vi.fn(), verifyGuestSessionAccess: vi.fn() }));
const flags = vi.hoisted(() => ({ portalEnabled: true, checkinEnabled: true }));

vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: async () => ({ ...flags }) }));
vi.mock('@/lib/guestSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/guestSession')>()),
  parseGuestSession: mocks.parseGuestSession,
  verifyGuestSessionAccess: mocks.verifyGuestSessionAccess,
}));

import { GET } from '@/app/api/portal/sessions/route';

const BOOKING_ID = '77000000-0000-4000-8000-000000000001';

function status() {
  return GET(new NextRequest('http://localhost:3000/api/portal/sessions', {
    headers: { cookie: 'guest_session=signed' },
  }), { params: Promise.resolve({}) });
}

describe('portal session status', () => {
  beforeEach(() => {
    flags.portalEnabled = true;
    flags.checkinEnabled = true;
    mocks.parseGuestSession.mockReturnValue({ type: 'guest', sid: 's', booking: { id: BOOKING_ID } });
  });

  it('returns the booking of the verified session and the check-in flag', async () => {
    mocks.verifyGuestSessionAccess.mockResolvedValue({ type: 'guest', sid: 's', booking: { id: BOOKING_ID } });

    const response = await status();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ authenticated: true, bookingId: BOOKING_ID, checkinEnabled: true });
  });

  it('reports a session that no longer verifies as signed out, without an error status', async () => {
    mocks.verifyGuestSessionAccess.mockResolvedValue(null);

    const response = await status();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ authenticated: false, bookingId: null, checkinEnabled: true });
  });

  it('reports an anonymous visitor as signed out without verifying anything', async () => {
    mocks.parseGuestSession.mockReturnValue(null);

    const response = await GET(new NextRequest('http://localhost:3000/api/portal/sessions'), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ authenticated: false, bookingId: null, checkinEnabled: true });
    expect(mocks.verifyGuestSessionAccess).not.toHaveBeenCalled();
  });

  it('reports check-in as off, in both bodies, while the portal is on and check-in is off', async () => {
    flags.checkinEnabled = false;
    mocks.verifyGuestSessionAccess.mockResolvedValueOnce({ type: 'guest', sid: 's', booking: { id: BOOKING_ID } });
    const signedIn = await status();
    mocks.verifyGuestSessionAccess.mockResolvedValueOnce(null);
    const signedOut = await status();

    expect(signedIn.status).toBe(200);
    expect((await signedIn.json()).data).toEqual({ authenticated: true, bookingId: BOOKING_ID, checkinEnabled: false });
    expect(signedOut.status).toBe(200);
    expect((await signedOut.json()).data).toEqual({ authenticated: false, bookingId: null, checkinEnabled: false });
  });

  it('answers 404 without verifying the session while the portal is off', async () => {
    flags.portalEnabled = false;
    flags.checkinEnabled = false;

    const response = await status();

    expect(response.status).toBe(404);
    expect(mocks.verifyGuestSessionAccess).not.toHaveBeenCalled();
  });
});
