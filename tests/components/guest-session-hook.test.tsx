// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/logger-client', () => ({ logger: { error: logError } }));

import { useGuestSession } from '@/hooks/useGuestSession';
import { emitGuestSessionChanged, onGuestSessionChange } from '@/lib/sessionSignals';

function status(authenticated: boolean, checkinEnabled = true) {
  return new Response(JSON.stringify({ success: true, data: { authenticated, bookingId: null, checkinEnabled } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function failure(httpStatus: number) {
  return new Response(JSON.stringify({ success: false }), {
    status: httpStatus,
    headers: { 'content-type': 'application/json' },
  });
}

function recheck() {
  act(() => { window.dispatchEvent(new Event('focus')); });
}

// Lets every promise continuation that is already queued run (the status request started by recheck()).
async function settle() {
  await act(async () => {});
}

describe('useGuestSession', () => {
  // A block body: an arrow that returns the mock would make vitest call it as a teardown after every test.
  beforeEach(() => { fetchMock.mockReset(); });

  it('tracks the authenticated flag of the status endpoint (signed in, then signed out on authenticated: false)', async () => {
    fetchMock.mockResolvedValue(status(true));
    const { result } = renderHook(() => useGuestSession());
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    fetchMock.mockResolvedValue(status(false));
    act(() => { window.dispatchEvent(new Event('focus')); });

    await waitFor(() => expect(result.current.isSignedIn).toBe(false));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/portal/sessions', expect.objectContaining({ method: 'GET' }));
  });

  it('reports the portal and check-in as off until a 200 arrives, then as the endpoint states them', async () => {
    fetchMock.mockResolvedValue(status(false, true));
    const { result } = renderHook(() => useGuestSession());
    expect(result.current).toMatchObject({ isSignedIn: false, portalEnabled: false, checkinEnabled: false });

    await waitFor(() => expect(result.current.portalEnabled).toBe(true));
    expect(result.current.checkinEnabled).toBe(true);

    fetchMock.mockResolvedValue(status(true, false));
    recheck();

    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    expect(result.current).toMatchObject({ portalEnabled: true, checkinEnabled: false });
  });

  it('treats a 200 without a check-in flag as check-in off', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { authenticated: false, bookingId: null } }), { status: 200 }));
    const { result } = renderHook(() => useGuestSession());

    await waitFor(() => expect(result.current.portalEnabled).toBe(true));
    expect(result.current.checkinEnabled).toBe(false);
  });

  it('turns the portal and check-in off, and the guest signed out, on a 404 (the portal was switched off)', async () => {
    fetchMock.mockResolvedValue(status(true, true));
    const { result } = renderHook(() => useGuestSession());
    await waitFor(() => expect(result.current).toMatchObject({ isSignedIn: true, portalEnabled: true, checkinEnabled: true }));

    fetchMock.mockResolvedValue(failure(404));
    recheck();

    await waitFor(() => expect(result.current.portalEnabled).toBe(false));
    expect(result.current).toMatchObject({ isSignedIn: false, checkinEnabled: false });
  });

  it.each([404, 503])('keeps the portal and check-in off while the first answer is a %i', async (httpStatus) => {
    fetchMock.mockResolvedValue(failure(httpStatus));
    const { result } = renderHook(() => useGuestSession());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await settle();

    expect(result.current).toMatchObject({ isSignedIn: false, portalEnabled: false, checkinEnabled: false });
  });

  it.each([
    { name: 'a 5xx answer', answer: () => failure(503) },
    { name: 'a network error', answer: () => Promise.reject(new TypeError('Failed to fetch')) },
  ])('keeps the last known portal and check-in flags on $name', async ({ answer }) => {
    fetchMock.mockResolvedValue(status(false, true));
    const { result } = renderHook(() => useGuestSession());
    await waitFor(() => expect(result.current).toMatchObject({ portalEnabled: true, checkinEnabled: true }));

    fetchMock.mockImplementation(async () => answer());
    recheck();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await settle();

    expect(result.current).toMatchObject({ portalEnabled: true, checkinEnabled: true });
  });

  describe('signing out', () => {
    const unsubscribers: Array<() => void> = [];

    afterEach(() => {
      for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
    });

    // What the other tabs of the browser are told, in order of arrival.
    function listenForSignals() {
      const reasons: Array<string | undefined> = [];
      unsubscribers.push(onGuestSessionChange((event) => { reasons.push(event.reason); }));
      return reasons;
    }

    // The status endpoint says "signed in"; the logout endpoint answers with logout(). Each call builds a new
    // Response, because a body can be read only once.
    function serve(logout: () => Response) {
      fetchMock.mockImplementation(async (url: string) => (url === '/api/portal/logout' ? logout() : status(true)));
    }

    it('posts the logout, ends up signed out and tells the other tabs', async () => {
      serve(() => new Response('{}', { status: 200 }));
      const { result } = renderHook(() => useGuestSession());
      await waitFor(() => expect(result.current.isSignedIn).toBe(true));
      const reasons = listenForSignals();

      let signedOut: boolean | undefined;
      await act(async () => { signedOut = await result.current.signOut(); });

      expect(signedOut).toBe(true);
      expect(result.current.isSignedIn).toBe(false);
      expect(fetchMock).toHaveBeenCalledWith('/api/portal/logout', { method: 'POST' });
      await waitFor(() => expect(reasons).toContain('signout'));
    });

    it.each([
      { name: 'an error status', logout: () => new Response('{}', { status: 500 }) },
      { name: 'a network error', logout: (): Response => { throw new TypeError('Failed to fetch'); } },
    ])('keeps the guest signed in and logs it when the logout fails with $name', async ({ logout }) => {
      serve(logout);
      const { result } = renderHook(() => useGuestSession());
      await waitFor(() => expect(result.current.isSignedIn).toBe(true));

      let signedOut: boolean | undefined;
      await act(async () => { signedOut = await result.current.signOut(); });

      expect(signedOut).toBe(false);
      expect(result.current.isSignedIn).toBe(true);
      expect(logError).toHaveBeenCalledWith('Guest logout failed', expect.any(Error));
    });

    it('signs out when another tab signs out, without asking the server again', async () => {
      fetchMock.mockImplementation(async () => status(true));
      const { result } = renderHook(() => useGuestSession());
      await waitFor(() => expect(result.current.isSignedIn).toBe(true));
      const requests = fetchMock.mock.calls.length;

      act(() => { emitGuestSessionChanged('signout'); });

      await waitFor(() => expect(result.current.isSignedIn).toBe(false));
      expect(fetchMock).toHaveBeenCalledTimes(requests);
    });
  });
});
