import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminSessionUpdateMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { adminSession: { updateMany: mocks.adminSessionUpdateMany } } }));

import { signAdmin } from '@/lib/auth/admin';
import { POST } from '@/app/api/admin/logout/route';

const SESSION_ID = '0f8d6a55-2f5e-4c43-9a5e-1d6d0f3f9b11';

function logout(cookie?: string): Promise<Response> {
  return POST(new NextRequest('http://localhost:3000/api/admin/logout', {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  }), { params: Promise.resolve({}) });
}

describe('admin logout route', () => {
  beforeEach(() => {
    mocks.adminSessionUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('revokes the session named by the admin cookie and expires the cookie', async () => {
    const token = signAdmin({ session_id: SESSION_ID });

    const response = await logout(`admin_jwt=${token}`);

    expect(response.status).toBe(200);
    expect(mocks.adminSessionUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.adminSessionUpdateMany.mock.calls[0][0].where).toEqual({ id: SESSION_ID, revokedAt: null });
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('admin_jwt=;');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('expires the cookie without a revocation when no cookie is sent', async () => {
    const response = await logout();

    expect(response.status).toBe(200);
    expect(mocks.adminSessionUpdateMany).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie') ?? '').toContain('Max-Age=0');
  });
});
