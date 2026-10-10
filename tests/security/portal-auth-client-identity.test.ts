import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  privacyHmac: vi.fn((value: string, context: string) => `${context}:${value}`),
  revokeRefreshFamily: vi.fn(),
  issueRefreshToken: vi.fn(),
  issueGuestSession: vi.fn(),
  parseGuestSession: vi.fn(),
  clearRefreshCookie: vi.fn(),
  createRefreshCookie: vi.fn(),
  createSessionCookie: vi.fn(),
}));

vi.mock('@/lib/privacyHash', () => ({ privacyHmac: authMocks.privacyHmac }));
vi.mock('@/lib/guestDataStore', () => ({
  guestStore: {
    revokeRefreshFamily: authMocks.revokeRefreshFamily,
    issueRefreshToken: authMocks.issueRefreshToken,
  },
}));
vi.mock('@/lib/guestSession', () => ({
  GUEST_REFRESH_COOKIE: 'guest_rt',
  clearRefreshCookie: authMocks.clearRefreshCookie,
  createRefreshCookie: authMocks.createRefreshCookie,
  createSessionCookie: authMocks.createSessionCookie,
  issueGuestSession: authMocks.issueGuestSession,
  parseGuestSession: authMocks.parseGuestSession,
}));

const CLIENT_IDENTITY_UNAVAILABLE = 'CLIENT_IDENTITY_UNAVAILABLE'; // response contract value
import { attachPortalAuthCookies, requestAuthContext } from '@/lib/portalAuthHttp';

describe('portal auth client identity', () => {
  beforeEach(() => {
    vi.stubEnv('ORIGIN_PROXY_SHARED_SECRET', '073b10dd0d75ab99f24afa5a32cf30945abddd8b8b003dd5ab0967e452c738f2');
  });

  function request(): NextRequest {
    return new NextRequest('https://guest.test/api/portal/sessions', {
      method: 'POST',
      headers: {
        'user-agent': 'synthetic-test-client',
        'x-forwarded-for': '203.0.113.10',
      },
    });
  }

  it('does not HMAC the unknown sentinel', () => {
    expect(() => requestAuthContext(request())).toThrow(expect.objectContaining({
      code: CLIENT_IDENTITY_UNAVAILABLE,
      reason: 'missing',
    }));
    expect(authMocks.privacyHmac).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'fails before refresh or session mutation when remember=%s',
    async (remember) => {
      await expect(attachPortalAuthCookies(
        request(),
        {} as never,
        { userId: 'user-id', bookingId: 'booking-id', remember },
      )).rejects.toMatchObject({ code: CLIENT_IDENTITY_UNAVAILABLE });

      expect(authMocks.privacyHmac).not.toHaveBeenCalled();
      expect(authMocks.revokeRefreshFamily).not.toHaveBeenCalled();
      expect(authMocks.issueGuestSession).not.toHaveBeenCalled();
      expect(authMocks.issueRefreshToken).not.toHaveBeenCalled();
    },
  );

  it('hashes the audit IP with the shared security-event context', () => {
    const trusted = new NextRequest('https://guest.test/api/portal/claims', {
      method: 'POST',
      headers: {
        'user-agent': 'synthetic-test-client',
        'x-origin-verified-client-ip': '203.0.113.10',
        'x-origin-proxy-attestation': String(process.env.ORIGIN_PROXY_SHARED_SECRET),
      },
    });

    expect(requestAuthContext(trusted)).toEqual({
      deviceHint: 'portal-auth:device-hint:v1:synthetic-test-client',
      ipHint: 'portal-auth:ip-hint:v1:203.0.113.10',
      ipHash: 'security-event-ip:v1:203.0.113.10',
    });
  });

  describe('refresh family handoff', () => {
    const PRESENTED_REFRESH_TOKEN = 'presented-family.presented-secret';
    const ISSUED_REFRESH_TOKEN = 'issued-family.issued-secret';

    function trustedRequest(cookie?: string): NextRequest {
      const headers: Record<string, string> = {
        'user-agent': 'synthetic-test-client',
        'x-origin-verified-client-ip': '203.0.113.10',
        'x-origin-proxy-attestation': String(process.env.ORIGIN_PROXY_SHARED_SECRET),
      };
      if (cookie) headers.cookie = cookie;
      return new NextRequest('https://guest.test/api/portal/sessions', { method: 'POST', headers });
    }

    beforeEach(() => {
      authMocks.issueGuestSession.mockResolvedValue('issued-session-token');
      authMocks.parseGuestSession.mockReturnValue({ sid: 'issued-session-id' });
      authMocks.issueRefreshToken.mockResolvedValue({ token: ISSUED_REFRESH_TOKEN });
      authMocks.createSessionCookie.mockReturnValue({ name: 'guest_session', value: 'issued-session-token', options: {} });
      authMocks.createRefreshCookie.mockReturnValue({ name: 'guest_rt', value: ISSUED_REFRESH_TOKEN, options: {} });
      authMocks.clearRefreshCookie.mockReturnValue({ name: 'guest_rt', value: '', options: { maxAge: 0 } });
    });

    it('revokes the presented refresh family once, before the new session and refresh token, when remember=true', async () => {
      const response = NextResponse.json({});

      await attachPortalAuthCookies(
        trustedRequest(`guest_rt=${PRESENTED_REFRESH_TOKEN}`),
        response,
        { userId: 'user-id', bookingId: 'booking-id', remember: true },
      );

      expect(authMocks.revokeRefreshFamily).toHaveBeenCalledTimes(1);
      expect(authMocks.revokeRefreshFamily).toHaveBeenCalledWith(PRESENTED_REFRESH_TOKEN);
      expect(authMocks.issueRefreshToken).toHaveBeenCalledTimes(1);
      const [revokedAt] = authMocks.revokeRefreshFamily.mock.invocationCallOrder;
      const [sessionIssuedAt] = authMocks.issueGuestSession.mock.invocationCallOrder;
      const [refreshIssuedAt] = authMocks.issueRefreshToken.mock.invocationCallOrder;
      expect(revokedAt).toBeLessThan(sessionIssuedAt);
      expect(revokedAt).toBeLessThan(refreshIssuedAt);
      // The newly issued refresh cookie replaces the presented one; it is not cleared.
      expect(authMocks.clearRefreshCookie).not.toHaveBeenCalled();
      expect(response.cookies.get('guest_rt')?.value).toBe(ISSUED_REFRESH_TOKEN);
    });

    it('revokes the presented refresh family once, before the new session, and clears the refresh cookie when remember=false', async () => {
      const response = NextResponse.json({});

      await attachPortalAuthCookies(
        trustedRequest(`guest_rt=${PRESENTED_REFRESH_TOKEN}`),
        response,
        { userId: 'user-id', bookingId: 'booking-id', remember: false },
      );

      expect(authMocks.revokeRefreshFamily).toHaveBeenCalledTimes(1);
      expect(authMocks.revokeRefreshFamily).toHaveBeenCalledWith(PRESENTED_REFRESH_TOKEN);
      const [revokedAt] = authMocks.revokeRefreshFamily.mock.invocationCallOrder;
      const [sessionIssuedAt] = authMocks.issueGuestSession.mock.invocationCallOrder;
      expect(revokedAt).toBeLessThan(sessionIssuedAt);
      expect(authMocks.issueRefreshToken).not.toHaveBeenCalled();
      expect(authMocks.clearRefreshCookie).toHaveBeenCalledTimes(1);
      expect(response.cookies.get('guest_rt')?.value).toBe('');
    });

    it.each([true, false])('revokes nothing when no refresh cookie is presented and remember=%s', async (remember) => {
      await attachPortalAuthCookies(
        trustedRequest(),
        NextResponse.json({}),
        { userId: 'user-id', bookingId: 'booking-id', remember },
      );

      expect(authMocks.revokeRefreshFamily).not.toHaveBeenCalled();
      expect(authMocks.issueGuestSession).toHaveBeenCalledTimes(1);
    });

    it.each([true, false])(
      'does not revoke the presented refresh family when client identity is unavailable and remember=%s',
      async (remember) => {
        const unattested = new NextRequest('https://guest.test/api/portal/sessions', {
          method: 'POST',
          headers: {
            'user-agent': 'synthetic-test-client',
            'x-forwarded-for': '203.0.113.10',
            cookie: `guest_rt=${PRESENTED_REFRESH_TOKEN}`,
          },
        });

        await expect(attachPortalAuthCookies(
          unattested,
          NextResponse.json({}),
          { userId: 'user-id', bookingId: 'booking-id', remember },
        )).rejects.toMatchObject({ code: CLIENT_IDENTITY_UNAVAILABLE });

        expect(authMocks.revokeRefreshFamily).not.toHaveBeenCalled();
        expect(authMocks.issueGuestSession).not.toHaveBeenCalled();
        expect(authMocks.issueRefreshToken).not.toHaveBeenCalled();
      },
    );
  });
});
