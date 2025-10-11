// Vitest globals are enabled; no named imports needed.
import { NextRequest } from 'next/server';
import { computeAfmCheckDigit } from '../lib/afm';

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

  it('rejects invalid AFM on verify', async () => {
  const { POST } = await import('../app/api/portal/verify/route');
    const req = await jsonPost('/api/portal/verify', {
      origin: 'GR',
      phone: '+306911234567',
      afm: '123456788', // invalid checksum
      bookingRef: 'XREF',
      lastName: 'Doe',
      remember: false,
    });
  const res = await POST(req as any, { params: {} } as any);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json?.error?.code || json?.error).toBeDefined();
  });

  it('Direct verify issues session and optional refresh cookies', async () => {
  const verifyMod = await import('../app/api/portal/verify/route');
    // Build a valid AFM using the same checksum logic as prod
    const base = '09425983';
    const check = computeAfmCheckDigit(base);
    const afm = base + String(check);
    const req1 = await jsonPost('/api/portal/verify', {
      origin: 'GR',
      phone: '+306911000001',
      afm,
      bookingRef: 'TSTREF1',
      lastName: 'Papadopoulos',
      remember: true,
    });
  const res1 = await verifyMod.POST(req1 as any, { params: {} } as any);
    expect(res1.status).toBe(200);
    const cookies: string[] = [];
    res1.headers.forEach((value: string, key: string) => { if (key.toLowerCase() === 'set-cookie') cookies.push(value); });
    const cookieBlob = cookies.join('\n');
    expect(cookieBlob).toContain('guest_session=');
    expect(cookieBlob).toContain('guest_rt=');

    // Extract refresh token for next step
    const rtMatch = cookieBlob.match(/guest_rt=([^;\s]+)/);
    expect(rtMatch).toBeTruthy();
    const refreshToken = rtMatch?.[1] as string;

    // Refresh GET with redirect
  const { GET: refreshGET } = await import('../app/api/portal/refresh/route');
  const req3 = makeReq('/api/portal/refresh?next=/en/check-in', { cookies: { guest_rt: refreshToken } });
  const res3 = await refreshGET(req3 as any, { params: {} } as any);
    expect([302, 307, 308]).toContain(res3.status);
    const loc = res3.headers.get('location') || res3.headers.get('Location');
    expect(loc).toBe('/en/check-in');

    // Logout clears cookies
  const { POST: logout } = await import('../app/api/portal/logout/route');
    const req4 = makeReq('/api/portal/logout', { method: 'POST', cookies: { guest_rt: refreshToken } });
  const res4 = await logout(req4 as any, { params: {} } as any);
    expect(res4.status).toBe(204);
    const clear = res4.headers.get('set-cookie') || '';
    expect(clear).toContain('guest_session=;');
    expect(clear).toContain('guest_rt=;');
  });
});

describe.sequential('Check-in API guard', () => {
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
        getGuestSessionFromCookies: async () => ({ booking: { status: 'VERIFIED', id: 'bkg_mock', source: 'ONSITE', reference: 'R' } }),
      };
    });
  const { GET } = await import('../app/api/check-in/route');
    const req = makeReq('/api/check-in');
  const res = await GET(req as any, { params: {} } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json?.data?.booking?.status).toBe('VERIFIED');
    vi.resetModules();
  });
});
