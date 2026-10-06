// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieValues = vi.hoisted(() => ({ values: new Map<string, string>() }));
const readActiveAdminSession = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieValues.values.has(name) ? { name, value: cookieValues.values.get(name) } : undefined),
  }),
}));
vi.mock('@/lib/auth/admin', () => ({ readActiveAdminSession }));
vi.mock('@/components/AdminSessionManager', () => ({
  default: ({ expiresAt }: { expiresAt: string | null }) => <div data-testid="session-manager" data-expires-at={expiresAt ?? ''} />,
}));

import AdminLayout from '@/app/admin/layout';

async function renderLayout() {
  render(await AdminLayout({ children: <main>Admin page body</main> }));
}

describe('admin layout shell (identity §9.12)', () => {
  beforeEach(() => {
    cookieValues.values.clear();
    readActiveAdminSession.mockResolvedValue(null);
  });

  it('renders the minimal header: brand mark, wordmark and "Admin", linking to the admin home', async () => {
    await renderLayout();

    const header = screen.getByRole('banner');
    const home = within(header).getByRole('link');
    expect(home).toHaveAttribute('href', '/admin');
    expect(home).toHaveTextContent('Dolce Far Niente');
    expect(within(home).getByText('Admin')).toBeInTheDocument();
    // BrandMark: the decorative svg inside the link.
    expect(home.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('Admin page body')).toBeInTheDocument();
  });

  it('does not render the public SiteHeader or its navigation', async () => {
    await renderLayout();

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(document.querySelector('.site-header')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('puts the header and the page inside the admin-scoped plain background wrapper', async () => {
    await renderLayout();

    const shell = screen.getByRole('banner').parentElement;
    expect(shell).toHaveClass('admin-shell');
    expect(shell).toContainElement(screen.getByText('Admin page body'));
  });

  it('keeps the session manager: signed out it receives no expiry, signed in the session expiry', async () => {
    await renderLayout();
    expect(screen.getByTestId('session-manager')).toHaveAttribute('data-expires-at', '');
    expect(readActiveAdminSession).not.toHaveBeenCalled();

    document.body.innerHTML = '';
    cookieValues.values.set('admin_jwt', 'jwt-value');
    readActiveAdminSession.mockResolvedValue({ expiresAt: new Date('2030-01-01T00:00:00.000Z') });
    await renderLayout();
    expect(readActiveAdminSession).toHaveBeenCalledWith('jwt-value');
    expect(screen.getByTestId('session-manager')).toHaveAttribute('data-expires-at', '2030-01-01T00:00:00.000Z');
  });
});
