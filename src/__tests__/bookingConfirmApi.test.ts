import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// In-memory store used by the mocked guestDataStore for deterministic tests
const memStore: { bookings: Map<string, any>; users: Map<string, any> } = {
  bookings: new Map(),
  users: new Map(),
};

vi.mock('@/lib/guestDataStore', () => ({
  guestStore: {
    findBookingById: (id: string) => memStore.bookings.get(id),
    setAccess: vi.fn(),
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
    memStore.bookings.clear();
    memStore.users.clear();
    vi.clearAllMocks();
  });

  it('returns 404 for unknown booking id', async () => {
    const { POST } = await import('../app/api/bookings/[id]/confirm/route');
    const req = makeReq('/api/bookings/does_not_exist/confirm', { cookies: { lang: 'en' } });
    const res = await (POST as any)(req, { params: Promise.resolve({ id: 'does_not_exist' }) });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json?.error || json?.error?.code).toBeDefined();
  });

  it('mints session and 303 redirects to locale check-in for valid booking', async () => {
    // Arrange: create isolated in-memory user and booking via mocked store
    const user = { id: 'usr_test_1', phone_e164: '+306911234567', country_origin: 'GR' };
    const booking = { id: 'bkg_test_1', source: 'ONSITE', start_date: new Date().toISOString().slice(0,10), end_date: new Date(Date.now()+86400000).toISOString().slice(0,10), user_id: user.id };
    memStore.users.set(user.id, user);
    memStore.bookings.set(booking.id, booking);
    const { POST } = await import('../app/api/bookings/[id]/confirm/route');

    const req = makeReq(`/api/bookings/${booking.id}/confirm`, { cookies: { lang: 'el' } });
    const res = await (POST as any)(req, { params: Promise.resolve({ id: booking.id }) });
    expect(res.status).toBe(303);
  const loc = res.headers.get('location') || res.headers.get('Location');
  expect(loc).toMatch(/\/el\/check-in\?bookingId=/);
    // Should set a guest_session cookie
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('guest_session=');
  });

  it('is idempotent when called twice (second call still 303)', async () => {
    const user = { id: 'usr_test_2', phone_e164: '+306911999999', country_origin: 'GR' };
    const booking = { id: 'bkg_test_2', source: 'ONSITE', start_date: new Date().toISOString().slice(0,10), end_date: new Date(Date.now()+86400000).toISOString().slice(0,10), user_id: user.id };
    memStore.users.set(user.id, user);
    memStore.bookings.set(booking.id, booking);
    const { POST } = await import('../app/api/bookings/[id]/confirm/route');
    const req1 = makeReq(`/api/bookings/${booking.id}/confirm`, { cookies: { lang: 'en' } });
    const res1 = await (POST as any)(req1, { params: Promise.resolve({ id: booking.id }) });
    expect(res1.status).toBe(303);
    const cookie1 = res1.headers.get('set-cookie') || '';
    expect(cookie1).toContain('guest_session=');

    // Second call with existing session cookie should still redirect 303
    const req2 = makeReq(`/api/bookings/${booking.id}/confirm`, { cookies: { lang: 'en', guest_session: (cookie1.match(/guest_session=([^;]+)/)?.[1] || '') } });
    const res2 = await (POST as any)(req2, { params: Promise.resolve({ id: booking.id }) });
    expect(res2.status).toBe(303);
  });
});
