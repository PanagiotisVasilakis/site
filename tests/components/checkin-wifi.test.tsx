// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('next/dynamic', () => ({ default: () => function MapStub() { return null; } }));

import CheckInInfo from '@/components/CheckInInfo';

function servePreferences(data: { wifi: { network: string; password: string } | null; wifiAvailableAt: string | null }) {
  fetchMock.mockImplementation(async (url: string) => {
    const body = url === '/api/check-in/preferences'
      ? { checkInTime: '15:00', checkOutTime: '11:00', canEdit: false, ...data }
      : { request: null };
    return new Response(JSON.stringify({ success: true, data: body }), { status: 200 });
  });
}

describe('check-in Wi-Fi availability', () => {
  it('says when the Wi-Fi details become available before the disclosure window', async () => {
    servePreferences({ wifi: null, wifiAvailableAt: '2099-06-14T12:00:00.000Z' });
    render(<CheckInInfo locale="en" />);

    const notices = await screen.findAllByText(/^Available from .*2099/u);
    expect(notices).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent(/Available from .*2099/u);
  });

  it('uses the Greek label on /el', async () => {
    servePreferences({ wifi: null, wifiAvailableAt: '2099-06-14T12:00:00.000Z' });
    render(<CheckInInfo locale="el" />);

    expect(await screen.findByRole('status')).toHaveTextContent(/^Διαθέσιμο από .*2099/u);
  });

  it('keeps "Unavailable" once the window has passed', async () => {
    servePreferences({ wifi: null, wifiAvailableAt: '2000-01-01T12:00:00.000Z' });
    render(<CheckInInfo locale="en" />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/check-in/preferences'));
    expect(screen.queryByText(/Available from/u)).not.toBeInTheDocument();
    expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThan(0);
  });

  it('shows the network inside the window', async () => {
    servePreferences({ wifi: { network: 'Guest-Net', password: 'p4ss-w0rd' }, wifiAvailableAt: '2000-01-01T12:00:00.000Z' });
    render(<CheckInInfo locale="en" />);

    expect((await screen.findAllByText('Guest-Net')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Available from/u)).not.toBeInTheDocument();
  });
});
