// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import { useGuestSession } from '@/hooks/useGuestSession';

function status(authenticated: boolean) {
  return new Response(JSON.stringify({ success: true, data: { authenticated, bookingId: null } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useGuestSession', () => {
  beforeEach(() => fetchMock.mockReset());

  it('is signed in when the status endpoint reports an authenticated session', async () => {
    fetchMock.mockResolvedValue(status(true));

    const { result } = renderHook(() => useGuestSession());

    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
  });

  it('stays signed out when the status endpoint answers 200 with authenticated: false', async () => {
    fetchMock.mockResolvedValue(status(false));

    const { result } = renderHook(() => useGuestSession());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/portal/sessions', expect.objectContaining({ method: 'GET' })));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.isSignedIn).toBe(false);
  });
});
