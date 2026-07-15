import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshPortalSession } from '@/lib/portalRefreshClient';

const baseHref = 'https://guest.test/en/portal/refresh';

function response(input: {
  status?: number;
  redirected?: boolean;
  url?: string;
  headers?: HeadersInit;
  json?: unknown;
} = {}): Response {
  const status = input.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: input.redirected ?? false,
    url: input.url ?? '',
    headers: new Headers(input.headers),
    json: vi.fn().mockResolvedValue(input.json),
  } as unknown as Response;
}

describe('portal refresh client state machine', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));

  it.each([
    ['https://evil.test/api/portal/refresh'],
    ['//evil.test/api/portal/refresh'],
    ['/api/other'],
    ['relative/path'],
  ])('rejects invalid refresh endpoint %s before network I/O', async (refreshHref) => {
    await expect(refreshPortalSession({ refreshHref, baseHref })).resolves.toEqual({ status: 'failed' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts with same-origin credentials and returns a validated next destination', async () => {
    vi.mocked(fetch).mockResolvedValue(response());
    await expect(refreshPortalSession({
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in%3Ffrom%3Dportal',
      baseHref,
    })).resolves.toEqual({ status: 'refreshed', href: '/en/check-in?from=portal' });
    expect(fetch).toHaveBeenCalledWith('/api/portal/refresh?next=%2Fen%2Fcheck-in%3Ffrom%3Dportal', {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'follow',
      headers: { accept: 'application/json' },
      signal: undefined,
    });
  });

  it.each([
    ['https://evil.test/steal'],
    ['/api/portal/refresh'],
    ['/en/portal/refresh'],
    [''],
  ])('rejects unsafe or recursive next destination %s', async (next) => {
    vi.mocked(fetch).mockResolvedValue(response());
    await expect(refreshPortalSession({
      refreshHref: `/api/portal/refresh?next=${encodeURIComponent(next)}`,
      baseHref,
    })).resolves.toEqual({ status: 'failed' });
  });

  it('accepts only same-origin, non-recursive followed redirects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({
      redirected: true,
      url: 'https://guest.test/el/check-in',
    }));
    await expect(refreshPortalSession({ refreshHref: '/api/portal/refresh', baseHref }))
      .resolves.toEqual({ status: 'refreshed', href: '/el/check-in' });
    vi.mocked(fetch).mockResolvedValueOnce(response({ redirected: true, url: 'https://evil.test/steal' }));
    await expect(refreshPortalSession({ refreshHref: '/api/portal/refresh', baseHref }))
      .resolves.toEqual({ status: 'failed' });
  });

  it('retries a declared concurrent refresh and then returns success', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({
        status: 409,
        headers: { 'retry-after': '0' },
        json: { error: { code: 'REFRESH_IN_PROGRESS' } },
      }))
      .mockResolvedValueOnce(response());
    await expect(refreshPortalSession({
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      baseHref,
    })).resolves.toEqual({ status: 'refreshed', href: '/en/check-in' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops after three concurrent refresh responses', async () => {
    vi.mocked(fetch).mockImplementation(async () => response({
      status: 409,
      headers: { 'retry-after': '0' },
      json: { code: 'REFRESH_IN_PROGRESS' },
    }));
    await expect(refreshPortalSession({
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      baseHref,
    })).resolves.toEqual({ status: 'failed' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry ordinary HTTP failures or malformed conflict responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ status: 503 }));
    await expect(refreshPortalSession({ refreshHref: '/api/portal/refresh', baseHref }))
      .resolves.toEqual({ status: 'failed' });
    vi.mocked(fetch).mockResolvedValueOnce(response({ status: 409, json: { code: 'OTHER_CONFLICT' } }));
    await expect(refreshPortalSession({ refreshHref: '/api/portal/refresh', baseHref }))
      .resolves.toEqual({ status: 'failed' });
  });

  it('maps network errors to a stable failure result', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    await expect(refreshPortalSession({ refreshHref: '/api/portal/refresh', baseHref }))
      .resolves.toEqual({ status: 'failed' });
  });

  it('returns aborted without issuing a request when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(refreshPortalSession({ refreshHref: '/api/portal/refresh', baseHref, signal: controller.signal }))
      .resolves.toEqual({ status: 'aborted' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels a pending retry when the caller aborts', async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      status: 409,
      headers: { 'retry-after': '5' },
      json: { code: 'REFRESH_IN_PROGRESS' },
    }));
    const controller = new AbortController();
    const pending = refreshPortalSession({
      refreshHref: '/api/portal/refresh?next=%2Fen%2Fcheck-in',
      baseHref,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(pending).resolves.toEqual({ status: 'aborted' });
  });
});
