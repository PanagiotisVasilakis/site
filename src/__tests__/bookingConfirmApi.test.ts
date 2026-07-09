// Using Vitest globals (configured in vitest.config.ts)
import { NextRequest } from 'next/server';
import { signGuestSession } from '@/lib/guestSession';

// In-memory store used by the mocked guestDataStore for deterministic tests
const memStore: { bookings: Map<string, any>; users: Map<string, any> } = {
  bookings: new Map(),
  users: new Map(),
};

const findBookingByReferenceAndLastName = vi.fn();
const setAccess = vi.fn();
const issueRefreshToken = vi.fn();

vi.mock('@/lib/guestDataStore', () => ({
  guestStore: {
    findBookingById: (id: string) => memStore.bookings.get(id),
    findBookingByReferenceAndLastName,
    setAccess,
    issueRefreshToken,
  },
}));

function makeReq(url: string, init?: RequestInit & { cookies?: Record<string, string> }) {
  const base = new URL(url, 'http://localhost');
  const headers = new Headers(init?.headers);
  const method = init?.method || 'POST';
  if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (init?.cookies) {
    const cookie = Object.entries(init.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    headers.set('cookie', cookie);
  }
  return new NextRequest(base, { method, headers, body: init?.body as any });
}

describe.sequential('POST /api/bookings/[id]/confirm', () => {
  beforeEach(() => {
    process.env.GUEST_JWT_SECRET = 'guest-test-secret-with-enough-entropy';
    memStore.bookings.clear();
    memStore.users.clear();
    vi.clearAllMocks();
    setAccess.mockResolvedValue({});
    issueRefreshToken.mockResolvedValue({ token: 'refresh-token' });
  });

  it('returns 404 for unknown booking id', async () => {
    const { POST } = await import('../app/api/bookings/[id]/confirm/route');
    const req = makeReq('/api/bookings/does_not_exist/confirm', { cookies: { lang: 'en' } });
    const res = await (POST as any)(req, { params: { id: 'does_not_exist' } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json?.error || json?.error?.code).toBeDefined();
  });

  it('rejects an anonymous confirmation without booking identity proof', async () => {
    const user = { id: 'usr_test_1', phone_e164: '+306911234567', country_origin: 'GR' };
    const booking = {
      id: 'bkg_test_1',
      reference: 'REF-1',
      source: 'EXTERNAL',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      user_id: user.id,
    };
    memStore.users.set(user.id, user);
    memStore.bookings.set(booking.id, booking);
    const { POST } = await import('../app/api/bookings/[id]/confirm/route');

    const req = makeReq(`/api/bookings/${booking.id}/confirm`, { cookies: { lang: 'el' } });
    const res = await (POST as any)(req, { params: { id: booking.id } });
    expect(res.status).toBe(401);
    expect(setAccess).not.toHaveBeenCalled();
  });

  it('rejects booking details that do not match', async () => {
    const booking = { id: 'bkg_test_2', reference: 'REF-2', user_id: 'usr_test_2' };
    memStore.bookings.set(booking.id, booking);
    findBookingByReferenceAndLastName.mockResolvedValue(undefined);
    const { POST } = await import('../app/api/bookings/[id]/confirm/route');

    const req = makeReq(`/api/bookings/${booking.id}/confirm`, {
      body: JSON.stringify({ lastName: 'Wrong' }),
    });
    const res = await (POST as any)(req, { params: { id: booking.id } });
    expect(res.status).toBe(403);
    expect(setAccess).not.toHaveBeenCalled();
  });

  it('mints a session only after server-side booking verification', async () => {
    const user = { id: 'usr_test_3', phone_e164: '+306911234567', country_origin: 'GR' };
    const booking = {
      id: 'bkg_test_3',
      reference: 'REF-3',
      source: 'EXTERNAL',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      user_id: user.id,
    };
    memStore.users.set(user.id, user);
    memStore.bookings.set(booking.id, booking);
    findBookingByReferenceAndLastName.mockResolvedValue(booking);
    const { POST } = await import('../app/api/bookings/[id]/confirm/route');

    const req = makeReq(`/api/bookings/${booking.id}/confirm`, {
      cookies: { lang: 'el' },
      body: JSON.stringify({ lastName: 'Papadopoulos' }),
    });
    const res = await (POST as any)(req, { params: { id: booking.id } });
    expect(res.status).toBe(303);
    const loc = res.headers.get('location') || res.headers.get('Location');
    expect(loc).toMatch(/\/el\/check-in\?bookingId=/);
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('guest_session=');
    expect(setAccess).toHaveBeenCalledWith(user.id, booking.id, 'VERIFIED');
  });

  it('ignores a client-supplied userId and uses the booking owner', async () => {
    const booking = { id: 'bkg_test_4', reference: 'REF-4', user_id: 'canonical-user' };
    memStore.bookings.set(booking.id, booking);
    findBookingByReferenceAndLastName.mockResolvedValue(booking);
    const { POST } = await import('../app/api/bookings/[id]/confirm/route');

    const req = makeReq(`/api/bookings/${booking.id}/confirm`, {
      body: JSON.stringify({ lastName: 'Owner', userId: 'attacker-user' }),
    });
    const res = await (POST as any)(req, { params: { id: booking.id } });
    expect(res.status).toBe(303);
    expect(setAccess).toHaveBeenCalledWith('canonical-user', booking.id, 'VERIFIED');
    expect(setAccess).not.toHaveBeenCalledWith('attacker-user', booking.id, 'VERIFIED');
  });

  it('allows an existing session only for its canonical booking owner', async () => {
    const booking = { id: 'bkg_test_5', reference: 'REF-5', user_id: 'usr_test_5' };
    memStore.bookings.set(booking.id, booking);
    const validToken = signGuestSession({
      user: { id: booking.user_id },
      booking: { id: booking.id },
    });
    const { POST } = await import('../app/api/bookings/[id]/confirm/route');

    const validReq = makeReq(`/api/bookings/${booking.id}/confirm`, {
      cookies: { guest_session: validToken },
    });
    const validRes = await (POST as any)(validReq, { params: { id: booking.id } });
    expect(validRes.status).toBe(303);

    const mismatchedToken = signGuestSession({
      user: { id: 'different-user' },
      booking: { id: booking.id },
    });
    const mismatchedReq = makeReq(`/api/bookings/${booking.id}/confirm`, {
      cookies: { guest_session: mismatchedToken },
    });
    const mismatchedRes = await (POST as any)(mismatchedReq, { params: { id: booking.id } });
    expect(mismatchedRes.status).toBe(401);
  });

  it('does not mint a session when access persistence fails', async () => {
    const booking = { id: 'bkg_test_6', reference: 'REF-6', user_id: 'usr_test_6' };
    memStore.bookings.set(booking.id, booking);
    findBookingByReferenceAndLastName.mockResolvedValue(booking);
    setAccess.mockRejectedValue(new Error('database unavailable'));
    const { POST } = await import('../app/api/bookings/[id]/confirm/route');

    const req = makeReq(`/api/bookings/${booking.id}/confirm`, {
      body: JSON.stringify({ lastName: 'Owner' }),
    });
    const res = await (POST as any)(req, { params: { id: booking.id } });
    expect(res.status).toBe(500);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
