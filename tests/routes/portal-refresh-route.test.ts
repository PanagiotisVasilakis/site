import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rotateRefreshToken: vi.fn(),
  getFeatureFlagsAsync: vi.fn(),
  checkSensitiveRateLimit: vi.fn(),
}));

vi.mock('@/lib/featureFlags', () => ({ getFeatureFlagsAsync: mocks.getFeatureFlagsAsync }));
vi.mock('@/lib/sensitiveRateLimit', () => ({ checkSensitiveRateLimit: mocks.checkSensitiveRateLimit }));

vi.mock('@/lib/guestDataStore', () => ({
  guestStore: { rotateRefreshToken: mocks.rotateRefreshToken },
}));
vi.mock('@/lib/portalAuthHttp', () => ({
  requestAuthContext: () => ({ deviceHint: 'device-hint', ipHint: 'ip-hint', ipHash: 'ip-hash' }),
}));

import { POST } from '@/app/api/portal/refresh/route';

function refresh(query = '', withCookie = true): Promise<Response> {
  // Route handlers see the server bind host in request.url (e.g. `next dev -H 0.0.0.0`).
  const request = new NextRequest(`http://0.0.0.0:3000/api/portal/refresh${query}`, {
    method: 'POST',
    headers: {
      ...(withCookie ? { cookie: 'guest_rt=family-id.presented-secret' } : {}),
      host: 'localhost:3001',
    },
  });
  return POST(request, { params: Promise.resolve({}) });
}

describe('portal refresh route response', () => {
  beforeEach(() => {
    mocks.getFeatureFlagsAsync.mockResolvedValue({ portalEnabled: true, checkinEnabled: true });
    mocks.checkSensitiveRateLimit.mockResolvedValue({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: new Date('2026-10-09T12:15:00.000Z'),
    });
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

  it('limits refreshes per client address only, and checks the limit before it rotates', async () => {
    const response = await refresh();

    expect(response.status).toBe(200);
    expect(mocks.checkSensitiveRateLimit).toHaveBeenCalledOnce();
    // No identifier: a constant one would put every guest into one shared bucket.
    expect(mocks.checkSensitiveRateLimit.mock.calls[0][1]).toStrictEqual({
      scope: 'portal-refresh',
      limit: 60,
      windowMs: 15 * 60_000,
    });
    expect(mocks.checkSensitiveRateLimit.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.rotateRefreshToken.mock.invocationCallOrder[0]);
  });

  it('answers 429 without rotating anything or touching the cookies when the limit is exceeded', async () => {
    mocks.checkSensitiveRateLimit.mockResolvedValue({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: new Date('2026-10-09T12:15:00.000Z'),
    });

    const response = await refresh();

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('never calls the limiter for a request without the refresh cookie', async () => {
    const response = await refresh('', false);

    expect(response.status).toBe(401);
    expect(mocks.checkSensitiveRateLimit).not.toHaveBeenCalled();
    expect(mocks.rotateRefreshToken).not.toHaveBeenCalled();
  });
});
