// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import AdminLoginClient from '@/app/admin/login/AdminLoginClient';

function login() {
  render(<AdminLoginClient />);
  fireEvent.change(screen.getByLabelText('Admin Secret'), { target: { value: 'secret-value' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
}

describe('admin login errors', () => {
  it.each([
    [429, { error: 'Too many authentication attempts' }, 'Too many authentication attempts'],
    [503, { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Client identity unavailable' } }, 'Client identity unavailable'],
    [401, { error: 'Unauthorized' }, 'Authentication failed'],
  ])('shows the reason for a %s response', async (status, body, expected) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

    login();

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    login();

    expect(await screen.findByText(/Unable to reach the server/u)).toBeInTheDocument();
  });
});
