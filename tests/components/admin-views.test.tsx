// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import AdminLoginClient from '@/app/admin/login/AdminLoginClient';
import AdminRequestsClient from '@/app/admin/requests/AdminRequestsClient';
import AdminSettingsClient from '@/app/admin/settings/AdminSettingsClient';

const REQUEST_ID = '76000000-0000-4000-8000-000000000001';

describe('admin login errors', () => {
  function submitLogin() {
    render(<AdminLoginClient />);
    fireEvent.change(screen.getByLabelText('Admin Secret'), { target: { value: 'secret-value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  }

  it.each([
    [429, { error: 'Too many authentication attempts' }, 'Too many authentication attempts'],
    [503, { error: 'Admin login disabled' }, 'Admin login disabled'],
    [503, { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Client identity unavailable' } }, 'Client identity unavailable'],
    [401, { error: 'Unauthorized' }, 'Authentication failed'],
  ])('shows the reason for a %s response', async (status, body, expected) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
    submitLogin();
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    submitLogin();
    expect(await screen.findByText(/Unable to reach the server/u)).toBeInTheDocument();
  });
});

describe('admin arrival requests: failed notifications', () => {
  beforeEach(() => {
    let retried = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/check-in/preferences') {
        return new Response(JSON.stringify({ success: true, data: { checkInTime: '14:30', checkOutTime: '11:00' } }), { status: 200 });
      }
      if (init?.method === 'PATCH') {
        retried = true;
        return new Response(JSON.stringify({ success: true, data: { notification: { status: 'queued' } } }), { status: 200 });
      }
      return new Response(JSON.stringify({
        success: true,
        data: {
          requests: [{
            id: REQUEST_ID,
            guestName: 'Maria',
            requestedTime: '17:00',
            status: 'pending',
            notificationStatus: retried ? 'pending' : 'dead',
            createdAt: '2030-06-01T10:00:00.000Z',
            updatedAt: '2030-06-01T10:00:00.000Z',
          }],
          summary: { pending: 1, approved: 0, rejected: 0, total: 1 },
          total: 1,
          nextCursor: null,
        },
      }), { status: 200 });
    });
  });

  it('marks a failed notification, shows standard check-in time, and requeues on retry', async () => {
    render(<AdminRequestsClient />);

    expect(await screen.findByText('Notification failed')).toBeInTheDocument();
    expect(await screen.findByText('14:30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry notification' }));

    expect(await screen.findByText('Notification queued for delivery.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/check-in-requests/${REQUEST_ID}`, expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ action: 'retry_delivery' }),
    }));
    expect(screen.queryByText('Notification failed')).not.toBeInTheDocument();
  });
});

describe('admin settings check-in times', () => {
  it('loads the saved times and posts the edited check-in time', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/flags') {
        return new Response(JSON.stringify({ success: true, data: { portalEnabled: true, checkinEnabled: true } }), { status: 200 });
      }
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          data: { message: 'Check-in preferences updated successfully', preferences: { checkInTime: '16:00', checkOutTime: '10:00', updatedAt: 1 } },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        success: true,
        data: { checkInTime: '15:30', checkOutTime: '10:00', updatedAt: 1, wifi: { network: 'Guest-Net', password: 'guest-pass' }, wifiAvailableAt: null },
      }), { status: 200 });
    });

    render(<AdminSettingsClient />);

    expect(await screen.findByLabelText('Check-in')).toHaveValue('15:30');
    expect(screen.getByLabelText('Check-out')).toHaveValue('10:00');
    expect(document.body.textContent).not.toContain('Guest-Net');

    fireEvent.change(screen.getByLabelText('Check-in'), { target: { value: '16:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
    expect(fetchMock).toHaveBeenCalledWith('/api/check-in/preferences', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"checkInTime":"16:00","checkOutTime":"10:00"}',
    }));
    expect(screen.getByLabelText('Check-in')).toHaveValue('16:00');
  });

  it('shows that the check-in workflow is required and skips reading times when off', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { portalEnabled: true, checkinEnabled: false } }), { status: 200 }));

    render(<AdminSettingsClient />);

    expect(await screen.findByText('Requires the check-in workflow.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Check-in')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/admin/flags']);
  });
});
