// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/logger-client', () => ({ logger: { warn: warnMock } }));
vi.mock('next/dynamic', () => ({ default: () => function MapStub() { return null; } }));

import CheckInInfo from '@/components/CheckInInfo';
import { ToastProvider } from '@/components/Toast';
import WifiAccessCard from '@/components/checkin/WifiAccessCard';

function servePreferences(data: { wifi: { network: string; password: string } | null; wifiAvailableAt: string | null; checkInTime?: string }) {
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
    servePreferences({ wifi: null, wifiAvailableAt: '2000-01-01T12:00:00.000Z', checkInTime: '14:00' });
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);

    await screen.findAllByText('14:00'); // R-531: the preferences response (not the 15:00 default) has been applied
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

// R-391 / R-684 / R-683 / R-682 (decision D13): the preferences are fetched once and the server adds the Wi-Fi
// details only after wifiAvailableAt, so a page left open before that time asks the server again one second
// after it. The page is never reloaded, so the form, its messages and the offline state stay as they are.
describe('check-in Wi-Fi refetch at the disclosure time', () => {
  const T0 = new Date('2030-03-01T10:00:00.000Z').getTime();
  const MAX_TIMER_DELAY = 2_147_483_647;
  const PREFERENCES_URL = '/api/check-in/preferences';
  const REFRESH_URL = '/en/portal/refresh?next=%2Fen%2Fcheck-in';
  const reload = vi.fn();
  const replace = vi.fn();
  const revealAfter = (ms: number) => new Date(T0 + ms).toISOString();
  const withheld = (ms: number, checkInTime = '14:00') => ({ prefs: { wifi: null, wifiAvailableAt: revealAfter(ms), checkInTime } });
  const revealed = (ms: number, checkInTime = '14:00') => ({
    prefs: { wifi: { network: 'Guest-Net', password: 'p4ss-w0rd' }, wifiAvailableAt: revealAfter(ms), checkInTime },
  });
  const offline = { fail: true } as const;
  const sessionExpired = { status: 401 } as const;

  type Step =
    | { prefs: Parameters<typeof servePreferences>[0] }
    | { fail: true }
    | { status: number };

  // The n-th request for the preferences gets the n-th step (the last step repeats).
  function serveSteps(steps: Step[]) {
    let call = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === PREFERENCES_URL) {
        const step = steps[Math.min(call, steps.length - 1)];
        call += 1;
        if ('fail' in step) throw new TypeError('Failed to fetch');
        if ('status' in step) return new Response(JSON.stringify({ error: { message: 'Authentication required' } }), { status: step.status });
        const body = { checkOutTime: '11:00', canEdit: false, ...step.prefs };
        return new Response(JSON.stringify({ success: true, data: body }), { status: 200 });
      }
      if (url === '/api/check-in/arrival-request' && init?.method === 'POST') {
        const request = { id: 'r1', requestedTime: '17:00', status: 'pending' };
        return new Response(JSON.stringify({ success: true, data: { request, notification: { status: 'sent' } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: { request: null } }), { status: 200 });
    });
  }

  const preferencesRequests = () => fetchMock.mock.calls.filter(([url]) => url === PREFERENCES_URL).length;

  async function advance(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  }

  async function renderPage(...steps: Step[]) {
    serveSteps(steps);
    const view = render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);
    await advance(0);
    // The first preferences response has been applied; otherwise a "nothing is sent" test would pass before the page knew the time.
    expect(screen.getAllByText('14:00').length).toBeGreaterThan(0);
    expect(preferencesRequests()).toBe(1);
    return view;
  }

  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  }

  // What a phone does when the guest unlocks it or switches back to the tab: both events can fire for one return.
  async function returnToTab() {
    await act(async () => {
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  async function connectionBack() {
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(T0);
    vi.stubGlobal('location', { ...window.location, reload, replace });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('shows the Wi-Fi details one second after they become available, without reloading the page', async () => {
    await renderPage(withheld(5_000), revealed(5_000));

    await advance(5_000);
    expect(preferencesRequests()).toBe(1);
    expect(screen.queryByText('Guest-Net')).not.toBeInTheDocument();
    await advance(1_000);

    expect(preferencesRequests()).toBe(2);
    expect(screen.getAllByText('Guest-Net').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Available from/u)).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    await advance(60_000);
    expect(preferencesRequests()).toBe(2);
  });

  it('applies only the Wi-Fi fields of the refetched preferences', async () => {
    await renderPage(withheld(5_000, '14:00'), revealed(5_000, '09:30'));

    await advance(6_000);

    expect(screen.getAllByText('Guest-Net').length).toBeGreaterThan(0);
    expect(screen.getAllByText('14:00').length).toBeGreaterThan(0);
    expect(screen.queryByText('09:30')).not.toBeInTheDocument();
  });

  it('asks the server again when the details are still withheld at that time, without a loop', async () => {
    await renderPage(withheld(5_000), withheld(5_000));

    await advance(6_000);
    expect(preferencesRequests()).toBe(2);
    await advance(120_000);
    expect(preferencesRequests()).toBe(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not ask again when the Wi-Fi details are already shown', async () => {
    // The server never sends a network together with a future time; this isolates the guard on the shown network.
    await renderPage(revealed(5_000));

    await advance(60_000);
    await returnToTab();
    expect(preferencesRequests()).toBe(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('sends nothing on a page loaded after the disclosure time, however often the tab returns', async () => {
    // After the stay the server still answers without the details, so asking again would only repeat that answer.
    await renderPage(withheld(-10_000));

    await advance(60_000);
    await returnToTab();
    await connectionBack();
    await returnToTab();
    expect(preferencesRequests()).toBe(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('sends nothing on a page loaded after the disclosure time when the arrival form is opened and closed', async () => {
    await renderPage(withheld(-10_000));
    fireEvent.click(screen.getByRole('button', { name: 'Request different arrival time' }));
    await advance(1_000);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await advance(60_000);
    expect(preferencesRequests()).toBe(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps the text of an arrival request form that is open across the disclosure time', async () => {
    await renderPage(withheld(5_000), revealed(5_000));
    fireEvent.click(screen.getByRole('button', { name: 'Request different arrival time' }));
    fireEvent.change(screen.getByLabelText('Preferred arrival time'), { target: { value: '17:30' } });
    fireEvent.change(screen.getByLabelText('Add a note'), { target: { value: 'Flight lands late' } });

    await advance(6_000);

    expect(screen.getAllByText('Guest-Net').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Preferred arrival time')).toHaveValue('17:30');
    expect(screen.getByLabelText('Add a note')).toHaveValue('Flight lands late');
    expect(screen.getByRole('button', { name: 'Send request' })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps the confirmation of a request sent after the disclosure time', async () => {
    await renderPage(withheld(5_000), revealed(5_000));
    fireEvent.click(screen.getByRole('button', { name: 'Request different arrival time' }));
    await advance(10_000);
    expect(screen.getAllByText('Guest-Net').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await advance(0);

    const confirmation = "Your request has been sent. We'll confirm availability as soon as possible.";
    expect(within(document.getElementById('arrival')!).getByRole('status')).toHaveTextContent(confirmation);
    await advance(60_000);
    expect(screen.getByText(confirmation)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps the confirmation of a request sent between the disclosure time and the refetch', async () => {
    // The time has passed but the refetch is due one second later, so the request is sent first.
    await renderPage(withheld(5_000), revealed(5_000));
    fireEvent.click(screen.getByRole('button', { name: 'Request different arrival time' }));
    await advance(5_500);
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await advance(0);

    const confirmation = "Your request has been sent. We'll confirm availability as soon as possible.";
    expect(within(document.getElementById('arrival')!).getByRole('status')).toHaveTextContent(confirmation);
    await advance(60_000);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText(confirmation)).toBeInTheDocument();
    expect(screen.getAllByText('Guest-Net').length).toBeGreaterThan(0);
  });

  it('retries once on the online event when the device is offline at the disclosure time', async () => {
    await renderPage(withheld(5_000), offline, revealed(5_000));
    // Nothing failed yet, so the online event has nothing to retry.
    await connectionBack();
    expect(preferencesRequests()).toBe(1);

    await advance(6_000);
    expect(preferencesRequests()).toBe(2);
    expect(screen.queryByText('Guest-Net')).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    await advance(120_000);
    expect(preferencesRequests()).toBe(2);

    await connectionBack();
    expect(preferencesRequests()).toBe(3);
    expect(screen.getAllByText('Guest-Net').length).toBeGreaterThan(0);
    await connectionBack();
    expect(preferencesRequests()).toBe(3);
    expect(reload).not.toHaveBeenCalled();
  });

  it('retries only once when the connection comes back but the request fails again', async () => {
    await renderPage(withheld(5_000), offline, offline, revealed(5_000));

    await advance(6_000);
    expect(preferencesRequests()).toBe(2);
    await connectionBack();
    expect(preferencesRequests()).toBe(3);
    await connectionBack();
    expect(preferencesRequests()).toBe(3);
    expect(screen.queryByText('Guest-Net')).not.toBeInTheDocument();
  });

  it('sends the guest to the session refresh page once when the session has expired', async () => {
    await renderPage(withheld(5_000), sessionExpired, revealed(5_000));

    await advance(6_000);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(REFRESH_URL);

    // The navigation is under way: neither another return to the tab nor the connection sends another request.
    await returnToTab();
    await connectionBack();
    expect(preferencesRequests()).toBe(2);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.queryByText('Guest-Net')).not.toBeInTheDocument();
  });

  // R-682: the wall clock can pass the time while the pending timer does not fire (a phone that slept, a frozen tab).
  it('asks again when the tab returns after the disclosure time and the timer did not fire', async () => {
    await renderPage(withheld(5_000), revealed(5_000));

    vi.setSystemTime(T0 + 2 * 3_600_000); // the wall clock moved 2 h; the pending timer did NOT fire
    await returnToTab();
    // The online event is not a return to the tab and nothing had failed.
    await connectionBack();

    expect(preferencesRequests()).toBe(2);
    expect(screen.getAllByText('Guest-Net').length).toBeGreaterThan(0);
    expect(reload).not.toHaveBeenCalled();
    await returnToTab();
    expect(preferencesRequests()).toBe(2);
  });

  it('does not ask when the tab returns before the disclosure time', async () => {
    await renderPage(withheld(60_000), revealed(60_000));

    await advance(30_000);
    await returnToTab();
    expect(preferencesRequests()).toBe(1);
  });

  it('does not ask when the tab becomes hidden, only when it becomes visible again', async () => {
    await renderPage(withheld(5_000), revealed(5_000));
    vi.setSystemTime(T0 + 2 * 3_600_000);

    await act(async () => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(preferencesRequests()).toBe(1);

    await returnToTab();
    expect(preferencesRequests()).toBe(2);
  });

  it('asks once per return while the server still withholds the details', async () => {
    // The device clock is ahead of the server: the time has passed here but the server answers without the details.
    await renderPage(withheld(5_000), withheld(5_000), withheld(5_000), revealed(5_000));
    vi.setSystemTime(T0 + 60_000);

    await returnToTab();
    expect(preferencesRequests()).toBe(2);
    await returnToTab();
    expect(preferencesRequests()).toBe(3);
    await returnToTab();
    expect(preferencesRequests()).toBe(4);
    expect(screen.getAllByText('Guest-Net').length).toBeGreaterThan(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it('stops asking when the page is removed', async () => {
    const { unmount } = await renderPage(withheld(5_000), revealed(5_000));

    unmount();
    await advance(60_000);
    vi.setSystemTime(T0 + 2 * 3_600_000);
    await returnToTab();
    await connectionBack();
    expect(preferencesRequests()).toBe(1);
  });

  // A browser fires a timer longer than 2^31-1 ms at once, which would send requests in a loop. The request is due
  // one second after the time, so MAX - 999 ms away is the nearest time whose delay already overflows.
  it.each([MAX_TIMER_DELAY - 999, MAX_TIMER_DELAY + 1])(
    'sets no timer that a browser would fire at once when the time is %i ms away',
    async (distance) => {
      await renderPage(withheld(distance), revealed(distance));

      await advance(10_000);
      expect(preferencesRequests()).toBe(1);
      expect(reload).not.toHaveBeenCalled();
    },
  );
});
