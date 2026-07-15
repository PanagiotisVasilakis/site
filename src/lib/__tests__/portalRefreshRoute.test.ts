import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  rotateRefreshToken: vi.fn(),
  findUserById: vi.fn(),
  findEligibleBookingForUser: vi.fn(),
  issueGuestSession: vi.fn(),
  revokeGuestSession: vi.fn(),
  createSessionCookie: vi.fn(() => ({
    name: 'guest_session',
    value: 'session-jwt',
    options: { path: '/', httpOnly: true },
  })),
  createRefreshCookie: vi.fn(() => ({
    name: 'guest_rt',
    value: 'rotated-token',
    options: { path: '/', httpOnly: true },
  })),
  clearSessionCookie: vi.fn(() => ({
    name: 'guest_session',
    value: '',
    options: { path: '/', maxAge: 0 },
  })),
  clearRefreshCookie: vi.fn(() => ({
    name: 'guest_rt',
    value: '',
    options: { path: '/', maxAge: 0 },
  })),
  counter: vi.fn(),
}));

vi.mock('@/lib/apiErrorHandler', () => ({
  withErrorHandler: (handler: unknown) => handler,
  createSuccessResponse: vi.fn((data: unknown) => NextResponse.json({ success: true, data })),
}));

vi.mock('@/lib/guestDataStore', () => ({
  guestStore: {
    rotateRefreshToken: mocks.rotateRefreshToken,
    findUserById: mocks.findUserById,
    findEligibleBookingForUser: mocks.findEligibleBookingForUser,
    revokeRefreshToken: vi.fn(),
  },
}));

vi.mock('@/lib/guestSession', () => ({
  createSessionCookie: mocks.createSessionCookie,
  createRefreshCookie: mocks.createRefreshCookie,
  clearSessionCookie: mocks.clearSessionCookie,
  clearRefreshCookie: mocks.clearRefreshCookie,
  issueGuestSession: mocks.issueGuestSession,
  parseGuestSession: vi.fn(),
  revokeGuestSession: mocks.revokeGuestSession,
}));

vi.mock('@/lib/logger-enterprise', () => ({
  logger: {
    getContext: vi.fn(() => ({ correlationId: 'test-correlation' })),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/metrics-collector', () => ({
  metrics: { counter: mocks.counter },
}));

vi.mock('@/lib/portalAuthHttp', () => ({
  requestAuthContext: vi.fn(() => ({
    deviceHint: 'device-hash',
    ipHint: 'ip-hash',
    ipHash: 'ip-hash',
  })),
}));

import { POST } from '@/app/api/portal/refresh/route';

describe('portal refresh race handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a retryable conflict without clearing cookies for a concurrent rotation', async () => {
    mocks.rotateRefreshToken.mockResolvedValue({ status: 'concurrent' });
    const request = new NextRequest('http://localhost/api/portal/refresh', {
      method: 'POST',
      headers: { cookie: 'guest_rt=refresh-token; guest_session=session-token' },
    });

    const response = await POST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(409);
    expect(response.headers.get('retry-after')).toBe('1');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: 'REFRESH_IN_PROGRESS',
        details: { retryable: true },
      },
    });
    expect(mocks.clearSessionCookie).not.toHaveBeenCalled();
    expect(mocks.clearRefreshCookie).not.toHaveBeenCalled();
    expect(mocks.counter).toHaveBeenCalledWith('refresh_token.concurrent', 1);
  });

  it('does not redirect to a backslash destination after a successful refresh', async () => {
    mocks.rotateRefreshToken.mockResolvedValue({
      status: 'rotated',
      old: { id: 'old-token', user_id: 'user-id' },
      rec: { id: 'new-token', family_id: 'family-id' },
      token: 'rotated-token',
    });
    mocks.findUserById.mockResolvedValue({ id: 'user-id' });
    mocks.findEligibleBookingForUser.mockResolvedValue({ id: 'booking-id' });
    mocks.issueGuestSession.mockResolvedValue('session-jwt');

    const request = new NextRequest(
      'http://localhost/api/portal/refresh?next=%2F%5Cattacker.test%2Fpath',
      { method: 'POST', headers: { cookie: 'guest_rt=refresh-token' } },
    );
    const response = await POST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { refreshed: true },
    });
  });
});
