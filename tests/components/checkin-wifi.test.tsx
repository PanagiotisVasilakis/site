// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/logger-client', () => ({ logger: { warn: warnMock } }));
vi.mock('next/dynamic', () => ({ default: () => function MapStub() { return null; } }));

import CheckInInfo from '@/components/CheckInInfo';
import { ToastProvider } from '@/components/Toast';
import WifiAccessCard from '@/components/checkin/WifiAccessCard';

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
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);

    const notices = await screen.findAllByText(/^Available from .*2099/u);
    expect(notices).toHaveLength(2);
    expect(within(document.getElementById('wifi')!).getByRole('status')).toHaveTextContent(/Available from .*2099/u);
  });

  it('names the time zone of the availability time', async () => {
    vi.stubEnv('TZ', 'UTC');
    servePreferences({ wifi: null, wifiAvailableAt: '2099-06-14T12:00:00.000Z' });
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);

    expect(await within(document.getElementById('wifi')!).findByRole('status')).toHaveTextContent('Available from 14 Jun 2099, 12:00 UTC');
  });

  it('uses the Greek label on /el', async () => {
    servePreferences({ wifi: null, wifiAvailableAt: '2099-06-14T12:00:00.000Z' });
    render(<ToastProvider><CheckInInfo locale="el" /></ToastProvider>);

    expect(await within(document.getElementById('wifi')!).findByRole('status')).toHaveTextContent(/^Διαθέσιμο από .*2099/u);
  });

  it('keeps "Unavailable" once the window has passed', async () => {
    servePreferences({ wifi: null, wifiAvailableAt: '2000-01-01T12:00:00.000Z' });
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/check-in/preferences'));
    expect(screen.queryByText(/Available from/u)).not.toBeInTheDocument();
    expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThan(0);
  });

  it('shows the network inside the window', async () => {
    servePreferences({ wifi: { network: 'Guest-Net', password: 'p4ss-w0rd' }, wifiAvailableAt: '2000-01-01T12:00:00.000Z' });
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);

    expect((await screen.findAllByText('Guest-Net')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Available from/u)).not.toBeInTheDocument();
  });
});

describe('check-in Wi-Fi copy', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    unhandled.length = 0;
    Reflect.deleteProperty(window.navigator, 'clipboard');
  });

  it('keeps the Copy label and handles the rejection when the clipboard refuses', async () => {
    process.on('unhandledRejection', onUnhandled);
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    servePreferences({ wifi: { network: 'Guest-Net', password: 'p4ss-w0rd' }, wifiAvailableAt: '2000-01-01T12:00:00.000Z' });
    const { container } = render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);

    const button = await screen.findByRole('button', { name: 'Copy Wi-Fi network name' });
    fireEvent.click(button);

    await vi.waitFor(() => expect(warnMock).toHaveBeenCalledWith('Clipboard copy failed', expect.anything()));
    expect(writeText).toHaveBeenCalledWith('Guest-Net');
    expect(button).toHaveTextContent(/^Copy$/u);
    // R-363: the guest is told the copy failed and what to do instead (the R-303 pattern).
    await vi.waitFor(() => expect(container.querySelector('.ui-toasts')).toHaveTextContent('Copy failed. Select the Wi-Fi details and copy them.'));
    expect(unhandled).toEqual([]);
  });
});

describe('check-in Wi-Fi copy toast (identity §9.8)', () => {
  afterEach(() => {
    Reflect.deleteProperty(window.navigator, 'clipboard');
  });

  it('confirms a successful copy with a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    servePreferences({ wifi: { network: 'Guest-Net', password: 'p4ss-w0rd' }, wifiAvailableAt: '2000-01-01T12:00:00.000Z' });
    const { container } = render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);

    fireEvent.click(await screen.findByRole('button', { name: 'Copy Wi-Fi password' }));

    expect(writeText).toHaveBeenCalledWith('p4ss-w0rd');
    await vi.waitFor(() => expect(container.querySelector('.ui-toasts')).toHaveTextContent('Wi-Fi details copied'));
  });
});

describe('check-in Wi-Fi value wrapping', () => {
  it('lets long network names and passwords wrap instead of overflowing the card', () => {
    const network = 'N'.repeat(32);
    const password = 'P'.repeat(63);
    render(
      <WifiAccessCard
        title="Wi-Fi"
        networkLabel="Network"
        passwordLabel="Password"
        network={network}
        password={password}
        unavailableLabel="Unavailable"
        copyLabel="Copy"
        copiedLabel="Copied"
        copiedTarget={null}
        onCopy={vi.fn()}
        networkCopyLabel="Copy Wi-Fi network name"
        passwordCopyLabel="Copy Wi-Fi password"
      />,
    );

    for (const value of [network, password]) {
      const span = screen.getByText(value);
      expect(span).toHaveClass('break-all');
      expect(span).not.toHaveClass('whitespace-nowrap');
    }
  });
});
