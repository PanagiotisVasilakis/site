// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshPortalSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/portalRefreshClient', () => ({ refreshPortalSession }));

import PortalRefreshRedirect from '@/components/PortalRefreshRedirect';

describe('portal refresh redirect shell', () => {
  beforeEach(() => {
    refreshPortalSession.mockResolvedValue({ status: 'aborted' });
  });

  it('announces progress and exposes a safe sign-in fallback', async () => {
    render(<PortalRefreshRedirect
      refreshHref="/api/portal/refresh?next=%2Fen%2Fcheck-in"
      failureHref="/en/guest/sign-in"
    />);
    expect(screen.getByRole('heading', { name: 'Refreshing your session' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Please wait');
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute('href', '/en/guest/sign-in');
    await waitFor(() => expect(refreshPortalSession).toHaveBeenCalledWith(expect.objectContaining({
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      baseHref: window.location.href,
      signal: expect.any(AbortSignal),
    })));
  });

  it('falls back to the site root for an unsafe failure URL', () => {
    render(<PortalRefreshRedirect
      refreshHref="/api/portal/refresh"
      failureHref="https://evil.test/steal"
    />);
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute('href', '/');
  });

  it('aborts in-flight refresh work when unmounted', async () => {
    let signal: AbortSignal | undefined;
    refreshPortalSession.mockImplementation((input?: { signal: AbortSignal }) => {
      if (input) signal = input.signal;
      return new Promise(() => undefined);
    });
    const { unmount } = render(<PortalRefreshRedirect
      refreshHref="/api/portal/refresh"
      failureHref="/en/guest/sign-in"
    />);
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
