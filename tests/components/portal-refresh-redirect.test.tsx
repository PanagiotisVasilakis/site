// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshPortalSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/portalRefreshClient', () => ({ refreshPortalSession }));

import PortalRefreshRedirect from '@/components/PortalRefreshRedirect';

describe('portal refresh redirect shell', () => {
  beforeEach(() => {
    refreshPortalSession.mockResolvedValue({ status: 'aborted' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces a calm status and starts the refresh', async () => {
    render(<PortalRefreshRedirect
      locale="en"
      refreshHref="/api/portal/refresh?next=%2Fen%2Fcheck-in"
      failureHref="/en/guest?mode=signin"
    />);
    expect(screen.getByRole('heading', { level: 1, name: 'Signing you in…' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Signing you in…');
    await waitFor(() => expect(refreshPortalSession).toHaveBeenCalledWith(expect.objectContaining({
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      baseHref: window.location.href,
      signal: expect.any(AbortSignal),
    })));
  });

  // identity §9.8: no endless spinner; after 5 s "Still working…" and a manual link.
  it('shows "Still working…" and the manual sign-in link after 5 s, not before', () => {
    vi.useFakeTimers();
    refreshPortalSession.mockImplementation(() => new Promise(() => undefined));
    render(<PortalRefreshRedirect locale="en" refreshHref="/api/portal/refresh" failureHref="/en/guest?mode=signin" />);

    act(() => { vi.advanceTimersByTime(4_999); });
    expect(screen.getByRole('status')).not.toHaveTextContent('Still working…');
    expect(screen.queryByRole('link', { name: 'Sign in instead' })).toBeNull();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole('status')).toHaveTextContent('Still working…');
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute('href', '/en/guest?mode=signin');
  });

  // Without client code (JS off, a chunk that fails to load) neither the refresh nor the timer runs, so the
  // server HTML carries the manual link in <noscript> from the start.
  it('server-renders the manual sign-in link inside <noscript>', () => {
    const html = renderToStaticMarkup(<PortalRefreshRedirect locale="en" refreshHref="/api/portal/refresh" failureHref="/en/guest?mode=signin" />);
    const noscript = /<noscript>([\s\S]*)<\/noscript>/u.exec(html)?.[1] ?? '';
    expect(noscript).toContain('href="/en/guest?mode=signin"');
    expect(noscript).toContain('Sign in instead');
    expect(refreshPortalSession).not.toHaveBeenCalled();
  });

  it('speaks Greek on /el', () => {
    vi.useFakeTimers();
    refreshPortalSession.mockImplementation(() => new Promise(() => undefined));
    render(<PortalRefreshRedirect locale="el" refreshHref="/api/portal/refresh" failureHref="/el/guest" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Σας συνδέουμε…' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByRole('status')).toHaveTextContent('Ακόμη σε εξέλιξη…');
    expect(screen.getByRole('link', { name: 'Σύνδεση με κωδικό' })).toHaveAttribute('href', '/el/guest');
  });

  it('falls back to the site root for an unsafe failure URL', () => {
    vi.useFakeTimers();
    render(<PortalRefreshRedirect
      locale="en"
      refreshHref="/api/portal/refresh"
      failureHref="https://evil.test/steal"
    />);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute('href', '/');
  });

  it('aborts in-flight refresh work when unmounted', async () => {
    let signal: AbortSignal | undefined;
    refreshPortalSession.mockImplementation((input?: { signal: AbortSignal }) => {
      if (input) signal = input.signal;
      return new Promise(() => undefined);
    });
    const { unmount } = render(<PortalRefreshRedirect
      locale="en"
      refreshHref="/api/portal/refresh"
      failureHref="/en/guest?mode=signin"
    />);
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
