// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
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

  it('tracks the authenticated flag of the status endpoint (signed in, then signed out on authenticated: false)', async () => {
    fetchMock.mockResolvedValue(status(true));
    const { result } = renderHook(() => useGuestSession());
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    fetchMock.mockResolvedValue(status(false));
    act(() => { window.dispatchEvent(new Event('focus')); });

    await waitFor(() => expect(result.current.isSignedIn).toBe(false));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/portal/sessions', expect.objectContaining({ method: 'GET' }));
  });
});
