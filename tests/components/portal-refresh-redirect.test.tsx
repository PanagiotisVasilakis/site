// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshPortalSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/portalRefreshClient', () => ({ refreshPortalSession }));

import PortalRefreshRedirect from '@/components/PortalRefreshRedirect';
import type { PortalRefreshResult } from '@/lib/portalRefreshClient';

// The page leaves through location.replace; unstubGlobals in vitest.config.ts restores location after each test.
function stubLocationReplace() {
  const replace = vi.fn<(destination: string) => void>();
  vi.stubGlobal('location', { ...window.location, replace });
  return replace;
}

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

  it('sends the guest on to the refreshed destination, once', async () => {
    const replace = stubLocationReplace();
    refreshPortalSession.mockResolvedValue({ status: 'refreshed', href: '/en/check-in' });
    render(<PortalRefreshRedirect
      locale="en"
      refreshHref="/api/portal/refresh?next=%2Fen%2Fcheck-in"
      failureHref="/en/guest?mode=signin"
    />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/check-in'));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'the sign-in page', failureHref: '/en/guest?mode=signin', destination: '/en/guest?mode=signin' },
    { name: 'the root for an off-site link', failureHref: 'https://evil.test/steal', destination: '/' },
    { name: 'the root for a script link', failureHref: 'javascript:alert(1)', destination: '/' },
  ])('sends a failed refresh to $name', async ({ failureHref, destination }) => {
    const replace = stubLocationReplace();
    refreshPortalSession.mockResolvedValue({ status: 'failed' });
    render(<PortalRefreshRedirect locale="en" refreshHref="/api/portal/refresh" failureHref={failureHref} />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when the refresh finishes after the guest has left the page', async () => {
    const replace = stubLocationReplace();
    let finish: (result: PortalRefreshResult) => void = () => undefined;
    const pending = new Promise<PortalRefreshResult>((resolve) => { finish = resolve; });
    refreshPortalSession.mockReturnValue(pending);
    const { unmount } = render(<PortalRefreshRedirect
      locale="en"
      refreshHref="/api/portal/refresh?next=%2Fen%2Fcheck-in"
      failureHref="/en/guest?mode=signin"
    />);
    await waitFor(() => expect(refreshPortalSession).toHaveBeenCalledTimes(1));

    unmount();
    finish({ status: 'refreshed', href: '/en/check-in' });
    await pending; // the component attached its own then() first, so it has already run when this resumes
    expect(replace).not.toHaveBeenCalled();
  });

  it('navigates only once when the refresh restarts after it has already navigated', async () => {
    const replace = stubLocationReplace();
    refreshPortalSession.mockResolvedValue({ status: 'refreshed', href: '/en/check-in' });
    const { rerender } = render(<PortalRefreshRedirect
      locale="en"
      refreshHref="/api/portal/refresh?next=%2Fen%2Fcheck-in"
      failureHref="/en/guest?mode=signin"
    />);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));

    // A changed refreshHref restarts the effect; the answer to the second refresh must not navigate again.
    rerender(<PortalRefreshRedirect
      locale="en"
      refreshHref="/api/portal/refresh?next=%2Fen%2Fstay"
      failureHref="/en/guest?mode=signin"
    />);
    await waitFor(() => expect(refreshPortalSession).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
