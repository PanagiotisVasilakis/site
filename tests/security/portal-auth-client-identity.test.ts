import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  privacyHmac: vi.fn((value: string, context: string) => `${context}:${value}`),
  revokeRefreshFamily: vi.fn(),
  issueRefreshToken: vi.fn(),
  issueGuestSession: vi.fn(),
  parseGuestSession: vi.fn(),
}));

vi.mock('@/lib/privacyHash', () => ({ privacyHmac: authMocks.privacyHmac }));
vi.mock('@/lib/guestDataStore', () => ({
  guestStore: {
    revokeRefreshFamily: authMocks.revokeRefreshFamily,
    issueRefreshToken: authMocks.issueRefreshToken,
  },
}));
vi.mock('@/lib/guestSession', () => ({
  clearRefreshCookie: vi.fn(),
  createRefreshCookie: vi.fn(),
  createSessionCookie: vi.fn(),
  issueGuestSession: authMocks.issueGuestSession,
  parseGuestSession: authMocks.parseGuestSession,
}));

import { CLIENT_IDENTITY_UNAVAILABLE } from '@/lib/net/clientIdentity';
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
});
