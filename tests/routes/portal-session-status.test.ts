import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ parseGuestSession: vi.fn(), verifyGuestSessionAccess: vi.fn() }));

vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: async () => ({ portalEnabled: true }) }));
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
    mocks.parseGuestSession.mockReturnValue({ type: 'guest', sid: 's', booking: { id: BOOKING_ID } });
  });

  it('returns the booking of the verified session', async () => {
    mocks.verifyGuestSessionAccess.mockResolvedValue({ type: 'guest', sid: 's', booking: { id: BOOKING_ID } });

    const response = await status();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ authenticated: true, bookingId: BOOKING_ID });
  });

  it('reports a session that no longer verifies as signed out, without an error status', async () => {
    mocks.verifyGuestSessionAccess.mockResolvedValue(null);

    const response = await status();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ authenticated: false, bookingId: null });
  });

  it('reports an anonymous visitor as signed out without verifying anything', async () => {
    mocks.parseGuestSession.mockReturnValue(null);

    const response = await GET(new NextRequest('http://localhost:3000/api/portal/sessions'), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ authenticated: false, bookingId: null });
    expect(mocks.verifyGuestSessionAccess).not.toHaveBeenCalled();
  });
});
