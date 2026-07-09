import { act, renderHook, waitFor } from '@testing-library/react';
import { useGuestSession } from '@/hooks/useGuestSession';

const mocks = vi.hoisted(() => ({
  internalFetch: vi.fn(),
  emitGuestSessionChanged: vi.fn(),
  onGuestSessionChange: vi.fn(),
  sessionListener: null as ((event: { reason?: string }) => void) | null,
}));

vi.mock('@/lib/internalFetchClient', () => ({ default: mocks.internalFetch }));
vi.mock('@/lib/sessionSignals', () => ({
  emitGuestSessionChanged: mocks.emitGuestSessionChanged,
  onGuestSessionChange: (listener: (event: { reason?: string }) => void) => {
    mocks.sessionListener = listener;
    return vi.fn();
  },
}));
vi.mock('@/lib/logger-client', () => ({
  logger: { error: vi.fn() },
}));

describe('useGuestSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionListener = null;
  });

  it('checks the guest session on every enabled surface', async () => {
    mocks.internalFetch.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useGuestSession());

    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    expect(mocks.internalFetch).toHaveBeenCalledWith('/api/check-in', expect.objectContaining({
      method: 'GET',
    }));
  });

  it('preserves the last verified state during a transient network error', async () => {
    mocks.internalFetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useGuestSession({ initialIsSignedIn: true }));

    await waitFor(() => expect(mocks.internalFetch).toHaveBeenCalled());
    expect(result.current.isSignedIn).toBe(true);
  });

  it('broadcasts logout and reacts immediately to a cross-tab logout', async () => {
    mocks.internalFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useGuestSession());
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.isSignedIn).toBe(false);
    expect(mocks.emitGuestSessionChanged).toHaveBeenCalledWith('signout');

    mocks.internalFetch.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      await result.current.checkSession();
    });
    expect(result.current.isSignedIn).toBe(true);

    act(() => {
      mocks.sessionListener?.({ reason: 'signout' });
    });
    expect(result.current.isSignedIn).toBe(false);
  });
});
