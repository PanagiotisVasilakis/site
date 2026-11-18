import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminSessionUpdateMany: vi.fn(),
  verifyAdminSession: vi.fn(),
  refreshAdminSession: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { adminSession: { updateMany: mocks.adminSessionUpdateMany } } }));
vi.mock('@/lib/auth/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/admin')>()),
  verifyAdminSession: mocks.verifyAdminSession,
  refreshAdminSession: mocks.refreshAdminSession,
}));

import { signAdmin } from '@/lib/auth/admin';
import { POST as logoutPost } from '@/app/api/admin/logout/route';
import { POST as refreshPost } from '@/app/api/admin/refresh/route';

const SESSION_ID = '0f8d6a55-2f5e-4c43-9a5e-1d6d0f3f9b11';
const PRODUCTION_JWT_SECRET = createHash('sha256').update('admin-session-cookie-fixture', 'utf8').digest('base64url');

describe('admin logout route', () => {
  function logout(cookie?: string): Promise<Response> {
    return logoutPost(new NextRequest('http://localhost:3000/api/admin/logout', {
      method: 'POST',
      headers: cookie ? { cookie } : {},
    }), { params: Promise.resolve({}) });
  }

  beforeEach(() => {
    mocks.adminSessionUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('expires the cookie without revocation when no cookie is sent', async () => {
    const response = await logout();

    expect(response.status).toBe(200);
    expect(mocks.adminSessionUpdateMany).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie') ?? '').toContain('Max-Age=0');
  });

  it('revokes the session named by the cookie and clears it with Secure Strict HttpOnly flags in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_JWT_SECRET', PRODUCTION_JWT_SECRET);
    const token = signAdmin({ session_id: SESSION_ID });

    const response = await logout(`admin_jwt=${token}`);

    expect(response.status).toBe(200);
    expect(mocks.adminSessionUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.adminSessionUpdateMany.mock.calls[0][0].where).toEqual({ id: SESSION_ID, revokedAt: null });
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('admin_jwt=;');
    expect(setCookie).toContain('Max-Age=0');
    const attributes = setCookie.split(/;\s*/u).slice(1).map((a) => a.toLowerCase());
    expect(attributes).toEqual(expect.arrayContaining(['httponly', 'samesite=strict', 'path=/', 'secure']));
  });
});

describe('admin session refresh route', () => {
  const NOW = new Date('2030-03-01T10:00:00.000Z');

  function refresh() {
    return refreshPost(new NextRequest('http://localhost:3000/api/admin/refresh', {
      method: 'POST',
      headers: { cookie: 'admin_jwt=signed' },
    }), { params: Promise.resolve({}) });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.verifyAdminSession.mockResolvedValue({
      type: 'admin', role: 'admin', session_id: SESSION_ID, login_at: Math.floor(NOW.getTime() / 1000) - 3600,
    });
  });
  afterEach(() => vi.useRealTimers());

  it('returns the new server-side expiry and a Secure cookie in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_JWT_SECRET', PRODUCTION_JWT_SECRET);
    mocks.refreshAdminSession.mockResolvedValue(new Date(NOW.getTime() + 2 * 60 * 60_000));

    const response = await refresh();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, expiresAt: '2030-03-01T12:00:00.000Z' });
    expect(response.cookies.get('admin_jwt')).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/', secure: true, maxAge: 7200 });
  });

  it('answers 401 when the session reached its absolute limit', async () => {
    mocks.refreshAdminSession.mockResolvedValue(null);

    const response = await refresh();

    expect(response.status).toBe(401);
    expect(response.cookies.get('admin_jwt')).toBeUndefined();
  });
});
