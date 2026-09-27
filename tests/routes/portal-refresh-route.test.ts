import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rotateRefreshToken: vi.fn(),
  getFeatureFlagsAsync: vi.fn(),
}));

vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: mocks.getFeatureFlagsAsync }));

vi.mock('@/lib/guestDataStore', () => ({
  guestStore: { rotateRefreshToken: mocks.rotateRefreshToken },
}));
vi.mock('@/lib/portalAuthHttp', () => ({
  requestAuthContext: () => ({ deviceHint: 'device-hint', ipHint: 'ip-hint', ipHash: 'ip-hash' }),
}));

import { POST } from '@/app/api/portal/refresh/route';

function refresh(query = ''): Promise<Response> {
  // Route handlers see the server bind host in request.url (e.g. `next dev -H 0.0.0.0`).
  const request = new NextRequest(`http://0.0.0.0:3000/api/portal/refresh${query}`, {
    method: 'POST',
    headers: { cookie: 'guest_rt=family-id.presented-secret', host: 'localhost:3001' },
  });
  return POST(request, { params: Promise.resolve({}) });
}

describe('portal refresh route response', () => {
  beforeEach(() => {
    mocks.getFeatureFlagsAsync.mockResolvedValue({ portalEnabled: true, checkinEnabled: true });
    mocks.rotateRefreshToken.mockResolvedValue({
      status: 'rotated',
      old: { id: 'old-token', user_id: 'user-1' },
      rec: { id: 'new-token', family_id: 'family-1' },
      token: 'new-token.secret',
      session: { id: 'session-1' },
      sessionToken: 'signed.session.jwt',
    });
  });

  it('answers 200 with rotated cookies and no bind-host Location when next is given', async () => {
    const response = await refresh(`?next=${encodeURIComponent('/en/check-in')}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain('guest_session=signed.session.jwt');
    expect(cookies).toContain('guest_rt=new-token.secret');
    expect(await response.json()).toMatchObject({ success: true, data: { refreshed: true } });
  });

  it('keeps the 401 and cleared cookies for a failed rotation', async () => {
    mocks.rotateRefreshToken.mockResolvedValue({ status: 'replayed' });

    const response = await refresh(`?next=${encodeURIComponent('/en/check-in')}`);

    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.getSetCookie().join('\n')).toMatch(/guest_rt=;/);
  });

  it('does not rotate tokens while the guest portal is switched off', async () => {
    mocks.getFeatureFlagsAsync.mockResolvedValue({ portalEnabled: false, checkinEnabled: false });

    const response = await refresh();

    expect(response.status).toBe(404);
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
  });
});
