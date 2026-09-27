// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  router: { replace: vi.fn() },
  pathname: { current: '/admin' },
}));

vi.mock('@/lib/internalFetchClient', () => ({ default: mocks.fetch }));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname.current,
  useRouter: () => mocks.router,
}));

import AdminSessionManager from '@/components/AdminSessionManager';

const T0 = new Date('2030-03-01T10:00:00.000Z').getTime();
const MINUTE = 60_000;
const at = (minutes: number) => new Date(T0 + minutes * MINUTE).toISOString();

function refreshed(expiresAtMinutes: number) {
  return new Response(JSON.stringify({ success: true, expiresAt: at(expiresAtMinutes) }), { status: 200 });
}

async function advance(minutes: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(minutes * MINUTE); });
}

function refreshCalls() {
  return mocks.fetch.mock.calls.filter(([url]) => url === '/api/admin/refresh').length;
}

describe('admin session manager', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(T0);
    mocks.pathname.current = '/admin';
  });
  afterEach(() => vi.useRealTimers());

  it('refreshes five minutes before the real server expiry, not on a fixed timer', async () => {
    mocks.fetch.mockResolvedValue(refreshed(145));
    render(<AdminSessionManager expiresAt={at(30)} />);

    await advance(24);
    expect(refreshCalls()).toBe(0);
    await advance(1);
    expect(refreshCalls()).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/refresh', { method: 'POST' });
    expect(screen.getByText('Session: ok')).toBeInTheDocument();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('keeps an active admin signed in by rescheduling from each refreshed expiry', async () => {
    mocks.fetch.mockResolvedValueOnce(refreshed(145)).mockResolvedValueOnce(refreshed(260));
    render(<AdminSessionManager expiresAt={at(30)} />);

    await advance(25);
    await advance(1);
    fireEvent.pointerDown(window);
    await advance(113);
    expect(refreshCalls()).toBe(1);
    await advance(1);
    expect(refreshCalls()).toBe(2);
    await advance(110);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('sends an idle tab to the login page at expiry without extending the session', async () => {
    mocks.fetch.mockResolvedValue(refreshed(145));
    render(<AdminSessionManager expiresAt={at(30)} />);

    await advance(25);
    expect(refreshCalls()).toBe(1);
    await advance(119);
    expect(refreshCalls()).toBe(1);
    expect(mocks.router.replace).not.toHaveBeenCalled();
    await advance(1);
    expect(refreshCalls()).toBe(1);
    expect(mocks.router.replace).toHaveBeenCalledWith('/admin/login');
  });

  it('refreshes at once when an idle admin becomes active before expiry', async () => {
    mocks.fetch.mockResolvedValue(refreshed(145));
    render(<AdminSessionManager expiresAt={at(30)} />);
    await advance(25);
    mocks.fetch.mockResolvedValue(refreshed(260));
    await advance(117);
    expect(refreshCalls()).toBe(1);

    fireEvent.keyDown(window, { key: 'a' });
    await advance(0);

    expect(refreshCalls()).toBe(2);
    await advance(10);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('goes to the login page when the server refuses the refresh', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 }));
    render(<AdminSessionManager expiresAt={at(30)} />);

    await advance(25);

    expect(mocks.router.replace).toHaveBeenCalledWith('/admin/login');
    expect(refreshCalls()).toBe(1);
  });

  it('retries a failed refresh every minute and stops at expiry', async () => {
    mocks.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<AdminSessionManager expiresAt={at(30)} />);

    await advance(25);
    expect(screen.getByText(/Token refresh failed/u)).toBeInTheDocument();
    await advance(4);
    expect(refreshCalls()).toBe(5);
    await advance(1);
    expect(mocks.router.replace).toHaveBeenCalledWith('/admin/login');
    const callsAtExpiry = refreshCalls();
    await advance(10);
    expect(refreshCalls()).toBe(callsAtExpiry);
  });

  it('asks the server instead of redirecting when the expiry it was given has passed', async () => {
    mocks.fetch.mockResolvedValue(refreshed(120));
    render(<AdminSessionManager expiresAt={at(-5)} />);

    await advance(0);

    expect(refreshCalls()).toBe(1);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('keeps one schedule across admin page navigations', async () => {
    mocks.fetch.mockResolvedValue(refreshed(145));
    const { rerender } = render(<AdminSessionManager expiresAt={at(30)} />);
    await advance(20);

    mocks.pathname.current = '/admin/guests';
    rerender(<AdminSessionManager expiresAt={at(30)} />);
    await advance(5);

    expect(refreshCalls()).toBe(1);
  });

  it.each([
    ['on the login page', '/admin/login', at(30)],
    ['without a session', '/admin', null],
  ])('renders nothing and never refreshes %s', async (_label, pathname, expiresAt) => {
    mocks.pathname.current = pathname;
    const { container } = render(<AdminSessionManager expiresAt={expiresAt} />);

    await advance(180);

    expect(container).toBeEmptyDOMElement();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
});
