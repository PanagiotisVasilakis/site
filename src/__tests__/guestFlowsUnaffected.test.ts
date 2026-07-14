import { NextRequest, NextResponse } from 'next/server';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  authenticatePortalUser: vi.fn(),
  consumeBookingClaimGrant: vi.fn(),
  attachPortalAuthCookies: vi.fn(async (_request: NextRequest, response: NextResponse) => {
    response.cookies.set('guest_session', 'signed-session', { httpOnly: true, path: '/' });
  }),
}));

vi.mock('@/lib/featureFlags', () => ({
  getFeatureFlagsAsync: vi.fn(async () => ({ portalEnabled: true, checkinEnabled: true })),
}));
vi.mock('@/lib/sensitiveRateLimit', () => ({
  checkSensitiveRateLimit: vi.fn(async () => ({
    allowed: true,
    limit: 5,
    remaining: 4,
    resetAt: new Date(Date.now() + 60_000),
  })),
}));
vi.mock('@/lib/portalAuthService', () => ({
  PortalAuthError: class PortalAuthError extends Error {},
  authenticatePortalUser: mocks.authenticatePortalUser,
  consumeBookingClaimGrant: mocks.consumeBookingClaimGrant,
}));
vi.mock('@/lib/portalAuthHttp', () => ({
  attachPortalAuthCookies: mocks.attachPortalAuthCookies,
  requestAuthContext: vi.fn(() => ({ deviceHint: 'device', ipHint: 'ip', ipHash: 'ip' })),
}));

function post(url: string, body: unknown) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('guest authentication routes use the claim-based architecture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatePortalUser.mockResolvedValue({ userId: USER_ID, bookingId: BOOKING_ID });
    mocks.consumeBookingClaimGrant.mockResolvedValue({ userId: USER_ID, bookingId: BOOKING_ID });
  });

  it('creates a session with phone and password only', async () => {
    const { POST } = await import('@/app/api/portal/sessions/route');
    const response = await POST(post('/api/portal/sessions', {
      phone: '+306900000001',
      password: 'correct-password',
      remember: false,
    }) as never, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect((await response.json()).data.bookingId).toBe(BOOKING_ID);
    expect(response.headers.get('set-cookie')).toContain('guest_session=signed-session');
    expect(mocks.authenticatePortalUser).toHaveBeenCalledWith({
      phone: '+306900000001',
      password: 'correct-password',
      remember: false,
    });
  });

  it('consumes a host-issued claim and records explicit terms acceptance', async () => {
    const { POST } = await import('@/app/api/portal/claims/route');
    const response = await POST(post('/api/portal/claims', {
      claimToken: `claim_${'a'.repeat(43)}`,
      origin: 'ABROAD',
      phone: '+306900000002',
      password: 'new-password',
      remember: true,
      acceptTerms: true,
    }) as never, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect((await response.json()).data.bookingId).toBe(BOOKING_ID);
    expect(mocks.consumeBookingClaimGrant).toHaveBeenCalledWith(expect.objectContaining({
      token: `claim_${'a'.repeat(43)}`,
      phone: '+306900000002',
      origin: 'ABROAD',
      password: 'new-password',
    }));
    expect(mocks.attachPortalAuthCookies).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.any(NextResponse),
      { userId: USER_ID, bookingId: BOOKING_ID, remember: true },
    );
  });

  it('permanently retires public booking-reference and identity-document signup', async () => {
    const { POST } = await import('@/app/api/portal/verify/route');
    const response = await POST(post('/api/portal/verify', {
      mode: 'signup',
      bookingRef: 'BOOK-2',
      lastName: 'Guest',
      passport: 'AB12345',
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(410);
    expect((await response.json()).error.code).toBe('CLAIM_GRANT_REQUIRED');
    expect(mocks.consumeBookingClaimGrant).not.toHaveBeenCalled();
  });
});
