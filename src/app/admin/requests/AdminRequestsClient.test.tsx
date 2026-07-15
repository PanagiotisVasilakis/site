import { act, fireEvent, render, screen } from '@testing-library/react';
import AdminRequestsClient from './AdminRequestsClient';

const internalFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: internalFetch }));
vi.mock('next/link', () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));

const payload = (name: string, status: 'pending' | 'approved') => ({
  ok: true,
  json: async () => ({
    success: true,
    data: {
      requests: [{
        id: name,
        guestName: name,
        requestedTime: '14:00',
        status,
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      }],
      summary: { pending: 1, approved: 1, rejected: 0, total: 2 },
    },
  }),
});

describe('AdminRequestsClient request ordering', () => {
  it('does not let an older filter response overwrite the latest filter', async () => {
    let resolvePending: ((value: ReturnType<typeof payload>) => void) | undefined;
    let resolveApproved: ((value: ReturnType<typeof payload>) => void) | undefined;
    internalFetch
      .mockReturnValueOnce(new Promise((resolve) => { resolvePending = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveApproved = resolve; }));
    render(<AdminRequestsClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Approved' }));
    await act(async () => { resolveApproved?.(payload('Latest approved guest', 'approved')); });
    expect(await screen.findByText('Latest approved guest')).toBeInTheDocument();

    await act(async () => { resolvePending?.(payload('Stale pending guest', 'pending')); });
    expect(screen.getByText('Latest approved guest')).toBeInTheDocument();
    expect(screen.queryByText('Stale pending guest')).not.toBeInTheDocument();
  });
});
