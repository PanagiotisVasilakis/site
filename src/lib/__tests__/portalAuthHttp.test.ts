import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  issueGuestSession: vi.fn(async () => 'session-token'),
  issueRefreshToken: vi.fn(async () => ({ token: 'new-refresh-token' })),
  revokeRefreshFamily: vi.fn(async () => true),
}));

vi.mock('@/lib/guestDataStore', () => ({
  guestStore: {
    issueRefreshToken: mocks.issueRefreshToken,
    revokeRefreshFamily: mocks.revokeRefreshFamily,
  },
}));

vi.mock('@/lib/guestSession', () => ({
  issueGuestSession: mocks.issueGuestSession,
  createSessionCookie: (value: string) => ({
    name: 'guest_session',
    value,
    options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 7_200 },
  }),
  createRefreshCookie: (value: string) => ({
    name: 'guest_rt',
    value,
    options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 604_800 },
  }),
  clearRefreshCookie: () => ({
    name: 'guest_rt',
    value: '',
    options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 0 },
  }),
}));

import { attachPortalAuthCookies } from '@/lib/portalAuthHttp';

describe('attachPortalAuthCookies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revokes the presented refresh family and clears its cookie when remember is false', async () => {
    const request = new NextRequest('http://localhost/api/portal/sessions', {
      headers: { cookie: 'guest_rt=presented-refresh-token' },
    });
    const response = NextResponse.json({ success: true });

    await attachPortalAuthCookies(request, response, {
      userId: 'user-1',
      bookingId: 'booking-1',
      remember: false,
    });

    expect(mocks.revokeRefreshFamily).toHaveBeenCalledWith('presented-refresh-token');
    expect(mocks.issueRefreshToken).not.toHaveBeenCalled();
    expect(response.cookies.get('guest_session')?.value).toBe('session-token');
    expect(response.headers.get('set-cookie')).toMatch(/guest_rt=;[^,]*Max-Age=0/i);
  });

  it('still expires a stale browser refresh cookie when no token is presented', async () => {
    const request = new NextRequest('http://localhost/api/portal/sessions');
    const response = NextResponse.json({ success: true });

    await attachPortalAuthCookies(request, response, {
      userId: 'user-1',
      bookingId: 'booking-1',
      remember: false,
    });

    expect(mocks.revokeRefreshFamily).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toMatch(/guest_rt=;[^,]*Max-Age=0/i);
  });

  it('issues a refresh token without revoking a family when remember is true', async () => {
    const request = new NextRequest('http://localhost/api/portal/sessions', {
      headers: { 'user-agent': 'test-device' },
    });
    const response = NextResponse.json({ success: true });

    await attachPortalAuthCookies(request, response, {
      userId: 'user-1',
      bookingId: 'booking-1',
      remember: true,
    });

    expect(mocks.revokeRefreshFamily).not.toHaveBeenCalled();
    expect(mocks.issueRefreshToken).toHaveBeenCalledWith('user-1', 7, expect.objectContaining({
      device_hint: expect.stringMatching(/^[0-9a-f]{64}$/),
      ip_hint: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(response.cookies.get('guest_rt')?.value).toBe('new-refresh-token');
  });
});
