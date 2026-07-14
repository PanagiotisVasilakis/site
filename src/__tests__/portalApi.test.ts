// Vitest globals are enabled; no named imports needed.
import { NextRequest } from 'next/server';

function makeReq(url: string, init?: RequestInit & { cookies?: Record<string, string> }) {
  const base = new URL(url, 'http://localhost');
  const headers = new Headers(init?.headers);
  if (init?.cookies) {
    const cookie = Object.entries(init.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    headers.set('cookie', cookie);
  }
  return new NextRequest(base, { method: init?.method, headers, body: init?.body as any });
}

async function jsonPost(url: string, body: unknown) {
  const req = makeReq(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return req;
}

describe('Portal API flow', () => {
  beforeAll(() => {
    // Direct verification flow
  });

  it('retires public reservation lookup signup', async () => {
    const { POST } = await import('../app/api/portal/verify/route');
    const req = await jsonPost('/api/portal/verify', {
      mode: 'signup',
      origin: 'GR',
      phone: '+306911234567',
      afm: '123456788', // invalid checksum
      bookingRef: 'XREF',
      lastName: 'Doe',
      remember: false,
    });
    const res = await POST(req as any, { params: {} } as any);
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json?.error?.code || json?.error).toBeDefined();
  });

  it('does not expose a state-changing refresh GET handler', async () => {
    const refreshModule = await import('../app/api/portal/refresh/route');
    expect('GET' in refreshModule).toBe(false);
  });
});

// Skip these tests if no database URL is available
const hasDbUrl = !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

describe.skipIf(!hasDbUrl)('Check-in API guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock('@/lib/guestSession');
  });
  it('returns 401 without a verified session', async () => {
    vi.resetModules();
    const { GET } = await import('../app/api/check-in/route');
    const req = makeReq('/api/check-in');
    const res = await GET(req as any, { params: {} } as any);
    expect(res.status).toBe(401);
  });

  it('returns booking data when session is verified (mocked)', async () => {
    // Mock guest session module to simulate a verified booking session BEFORE importing the route
    vi.resetModules();
    vi.doMock('@/lib/guestSession', async () => {
      const actual: any = await vi.importActual('@/lib/guestSession');
      return {
        ...actual,
        getVerifiedGuestSessionFromCookies: async () => ({ booking: { id: '11111111-1111-4111-8111-111111111111' } }),
      };
    });
    vi.doMock('@/lib/guestDataStore', () => ({
      guestStore: {
        findBookingById: async () => ({
          id: '11111111-1111-4111-8111-111111111111',
          source: 'ONSITE',
          reference: 'R',
          start_date: '2026-07-14',
          end_date: '2026-07-15',
          provider: 'test',
          access_status: 'VERIFIED',
          created_at: Date.now(),
        }),
        getCheckinCompletionByBooking: async () => undefined,
      },
    }));
    const { GET } = await import('../app/api/check-in/route');
    const req = makeReq('/api/check-in');
    const res = await GET(req as any, { params: {} } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json?.data?.booking?.status).toBe('VERIFIED');
    vi.resetModules();
    vi.unmock('@/lib/guestDataStore');
  });
});
