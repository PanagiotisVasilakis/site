import { act, fireEvent, render, screen } from '@testing-library/react';
import AdminSessionManager from './AdminSessionManager';

const internalFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: internalFetch }));

describe('AdminSessionManager recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    internalFetch.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('offers an immediate refresh retry after a scheduled refresh fails', async () => {
    internalFetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    render(<AdminSessionManager />);

    await act(async () => { await vi.advanceTimersByTimeAsync(105 * 60 * 1000); });
    expect(screen.getByText(/Token refresh failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    await act(async () => { await Promise.resolve(); });

    expect(internalFetch).toHaveBeenNthCalledWith(2, '/api/admin/refresh', { method: 'POST' });
    expect(screen.queryByText(/Token refresh failed/i)).not.toBeInTheDocument();
  });

  it('does not reload after a failed logout response', async () => {
    internalFetch.mockResolvedValue({ ok: false });
    render(<AdminSessionManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/Token refresh failed/i)).toBeInTheDocument();
  });
});
