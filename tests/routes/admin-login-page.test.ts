import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  verifyAdminSession: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (name === 'admin_jwt' && mocks.cookieValue ? { value: mocks.cookieValue } : undefined),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (target: string) => { throw new Error(`NEXT_REDIRECT ${target}`); },
}));
vi.mock('@/lib/auth/admin', () => ({
  verifyAdminSession: mocks.verifyAdminSession,
}));

import AdminLoginPage from '@/app/admin/login/page';
import AdminLoginClient from '@/app/admin/login/AdminLoginClient';

describe('/admin/login page', () => {
  beforeEach(() => {
    mocks.cookieValue = undefined;
    mocks.verifyAdminSession.mockResolvedValue(null);
  });

  it('redirects already-authenticated admins straight to /admin', async () => {
    mocks.cookieValue = 'valid.admin.jwt';
    mocks.verifyAdminSession.mockResolvedValue({ type: 'admin', role: 'admin', session_id: 's1' });

    await expect(AdminLoginPage()).rejects.toThrow(new Error('NEXT_REDIRECT /admin'));
    expect(mocks.verifyAdminSession).toHaveBeenCalledExactlyOnceWith('valid.admin.jwt');
  });

  it('renders AdminLoginClient when there is no active admin session', async () => {
    mocks.cookieValue = 'stale.admin.jwt';
    mocks.verifyAdminSession.mockResolvedValue(null);

    const element = await AdminLoginPage();
    expect(element.type).toBe(AdminLoginClient);
  });
});
