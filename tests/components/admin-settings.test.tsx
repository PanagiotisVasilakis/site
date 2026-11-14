// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import AdminSettingsClient from '@/app/admin/settings/AdminSettingsClient';

describe('admin settings check-in times', () => {
  it('loads the saved times and posts the edited check-in time', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/flags') {
        return new Response(JSON.stringify({ success: true, data: { portalEnabled: true, checkinEnabled: true } }), { status: 200 });
      }
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true, data: { message: 'Check-in preferences updated successfully', preferences: { checkInTime: '16:00', checkOutTime: '10:00', updatedAt: 1 } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: { checkInTime: '15:30', checkOutTime: '10:00', updatedAt: 1, wifi: { network: 'Guest-Net', password: 'guest-pass' }, wifiAvailableAt: null } }), { status: 200 });
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

  it('shows that the check-in workflow is required and does not read the times', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { portalEnabled: true, checkinEnabled: false } }), { status: 200 }));

    render(<AdminSettingsClient />);

    expect(await screen.findByText('Requires the check-in workflow.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Check-in')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/admin/flags']);
  });
});
