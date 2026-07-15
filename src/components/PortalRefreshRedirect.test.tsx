import { render, screen, waitFor } from '@testing-library/react';
import PortalRefreshRedirect, {
  refreshPortalSession,
  toSafeLocalHref,
} from './PortalRefreshRedirect';

const redirectedResponse = (url: string): Response => {
  const response = new Response(null, { status: 200 });
  Object.defineProperties(response, {
    redirected: { value: true },
    url: { value: url },
  });
  return response;
};

const concurrencyResponse = (): Response => new Response(JSON.stringify({
  error: { code: 'REFRESH_IN_PROGRESS' },
}), {
  status: 409,
  headers: {
    'content-type': 'application/json',
    'retry-after': '1',
  },
});

describe('refreshPortalSession', () => {
  it('POSTs the refresh request and uses the final same-origin redirect', async () => {
    const fetcher = vi.fn().mockResolvedValue(redirectedResponse('https://villa.test/en/check-in?ready=1'));

    await expect(refreshPortalSession({
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      baseHref: 'https://villa.test/en/portal/refresh',
      fetcher,
    })).resolves.toEqual({ status: 'refreshed', href: '/en/check-in?ready=1' });

    expect(fetcher).toHaveBeenCalledWith('/api/portal/refresh?next=%2Fen%2Fcheck-in', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'follow',
    }));
  });

  it('waits for a concurrent refresh and retries without an early fallback', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(concurrencyResponse())
      .mockResolvedValueOnce(redirectedResponse('https://villa.test/en/check-in'));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(refreshPortalSession({
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      baseHref: 'https://villa.test/en/portal/refresh',
      fetcher,
      sleep,
    })).resolves.toEqual({ status: 'refreshed', href: '/en/check-in' });

    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(1_000, undefined);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('bounds concurrency retries and rejects unsafe destinations', async () => {
    const fetcher = vi.fn().mockImplementation(async () => concurrencyResponse());
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(refreshPortalSession({
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      baseHref: 'https://villa.test/en/portal/refresh',
      fetcher,
      sleep,
      maxAttempts: 2,
    })).resolves.toEqual({ status: 'failed' });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(toSafeLocalHref('https://attacker.test/', 'https://villa.test/en')).toBeNull();
  });

  it('rejects path separators that can be reinterpreted as a foreign origin', () => {
    const base = 'https://villa.test/en/portal/refresh';

    expect(toSafeLocalHref('/\\\\attacker.test/path', base)).toBeNull();
    expect(toSafeLocalHref('/%5c%5cattacker.test/path', base)).toBeNull();
    expect(toSafeLocalHref('/%2f%2fattacker.test/path', base)).toBeNull();
    expect(toSafeLocalHref('/\n/attacker.test/path', base)).toBeNull();
    expect(toSafeLocalHref('/en/check-in?next=https%3A%2F%2Fattacker.test', base))
      .toBe('/en/check-in?next=https%3A%2F%2Fattacker.test');
  });

  it('rejects a followed redirect back to the refresh page instead of looping', async () => {
    await expect(refreshPortalSession({
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      baseHref: 'https://villa.test/en/portal/refresh',
      fetcher: vi.fn().mockResolvedValue(redirectedResponse('https://villa.test/en/portal/refresh')),
    })).resolves.toEqual({ status: 'failed' });
  });
});

describe('PortalRefreshRedirect', () => {
  it('navigates once after the 409 retry succeeds', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(concurrencyResponse())
      .mockResolvedValueOnce(redirectedResponse(`${window.location.origin}/en/check-in`));
    const navigate = vi.fn();

    render(
      <PortalRefreshRedirect
        refreshHref="/api/portal/refresh?next=%2Fen%2Fcheck-in"
        failureHref="/en/guest"
        fetcher={fetcher}
        sleep={async () => undefined}
        navigate={navigate}
      />,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/en/check-in'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalledWith('/en/guest');
  });

  it('uses only a safe local fallback after a failed request', async () => {
    const navigate = vi.fn();
    render(
      <PortalRefreshRedirect
        refreshHref="/api/portal/refresh?next=%2Fen%2Fcheck-in"
        failureHref="https://attacker.test/sign-in"
        fetcher={vi.fn().mockRejectedValue(new Error('offline'))}
        navigate={navigate}
      />,
    );

    expect(screen.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute('href', '/');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('does not render or navigate to a backslash fallback', async () => {
    const navigate = vi.fn();
    render(
      <PortalRefreshRedirect
        refreshHref="/api/portal/refresh?next=%2Fen%2Fcheck-in"
        failureHref="/\\\\attacker.test/sign-in"
        fetcher={vi.fn().mockRejectedValue(new Error('offline'))}
        navigate={navigate}
      />,
    );

    expect(screen.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute('href', '/');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
  });
});
