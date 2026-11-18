// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  readActiveAdminSession: vi.fn(),
  verifyAdminSession: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (name === 'admin_jwt' && mocks.cookieValue ? { name, value: mocks.cookieValue } : undefined),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (target: string) => { throw new Error(`NEXT_REDIRECT ${target}`); },
}));
vi.mock('@/lib/auth/admin', () => ({
  readActiveAdminSession: mocks.readActiveAdminSession,
  verifyAdminSession: mocks.verifyAdminSession,
}));
vi.mock('@/components/AdminSessionManager', () => ({
  default: ({ expiresAt }: { expiresAt: string | null }) => <div data-testid="session-manager" data-expires-at={expiresAt ?? ''} />,
}));

import AdminLayout from '@/app/admin/layout';
import AdminLoginClient from '@/app/admin/login/AdminLoginClient';
import AdminLoginPage from '@/app/admin/login/page';

describe('admin layout shell', () => {
  beforeEach(() => {
    mocks.cookieValue = undefined;
    mocks.readActiveAdminSession.mockResolvedValue(null);
  });

  it('renders the admin header without SiteHeader nav and passes session expiry to AdminSessionManager', async () => {
    render(await AdminLayout({ children: <main>Admin page body</main> }));
    const home = within(screen.getByRole('banner')).getByRole('link');
    expect(home).toHaveAttribute('href', '/admin');
    expect(within(home).getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByTestId('session-manager')).toHaveAttribute('data-expires-at', '');
    expect(mocks.readActiveAdminSession).not.toHaveBeenCalled();

    document.body.innerHTML = '';
    mocks.cookieValue = 'jwt-value';
    mocks.readActiveAdminSession.mockResolvedValue({ expiresAt: new Date('2030-01-01T00:00:00.000Z') });
    render(await AdminLayout({ children: <main>Admin page body</main> }));
    expect(mocks.readActiveAdminSession).toHaveBeenCalledWith('jwt-value');
    expect(screen.getByTestId('session-manager')).toHaveAttribute('data-expires-at', '2030-01-01T00:00:00.000Z');
  });
});

describe('/admin/login page', () => {
  beforeEach(() => {
    mocks.cookieValue = undefined;
    mocks.verifyAdminSession.mockResolvedValue(null);
  });

  it('redirects already-authenticated admins to /admin and renders login otherwise', async () => {
    mocks.cookieValue = 'valid.admin.jwt';
    mocks.verifyAdminSession.mockResolvedValue({ type: 'admin', role: 'admin', session_id: 's1' });
    await expect(AdminLoginPage()).rejects.toThrow(new Error('NEXT_REDIRECT /admin'));
    expect(mocks.verifyAdminSession).toHaveBeenCalledExactlyOnceWith('valid.admin.jwt');

    mocks.cookieValue = 'stale.admin.jwt';
    mocks.verifyAdminSession.mockResolvedValue(null);
    const element = await AdminLoginPage();
    expect(element.type).toBe(AdminLoginClient);
  });
});
