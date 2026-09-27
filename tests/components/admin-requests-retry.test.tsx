// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import AdminRequestsClient from '@/app/admin/requests/AdminRequestsClient';

const ID = '76000000-0000-4000-8000-000000000001';

function list(notificationStatus: string | null) {
  return new Response(JSON.stringify({
    success: true,
    data: {
      requests: [{
        id: ID, guestName: 'Maria', requestedTime: '17:00', status: 'pending', notificationStatus,
        createdAt: '2030-06-01T10:00:00.000Z', updatedAt: '2030-06-01T10:00:00.000Z',
      }],
      summary: { pending: 1, approved: 0, rejected: 0, total: 1 },
      total: 1,
      nextCursor: null,
    },
  }), { status: 200 });
}

describe('admin arrival requests: failed notifications', () => {
  beforeEach(() => {
    let retried = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        retried = true;
        return new Response(JSON.stringify({ success: true, data: { notification: { status: 'queued' } } }), { status: 200 });
      }
      return list(retried ? 'pending' : 'dead');
    });
  });

  it('marks a failed notification and requeues it on request', async () => {
    render(<AdminRequestsClient />);

    expect(await screen.findByText('Notification failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry notification' }));

    expect(await screen.findByText('Notification queued for delivery.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/check-in-requests/${ID}`, expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ action: 'retry_delivery' }),
    }));
    expect(screen.queryByText('Notification failed')).not.toBeInTheDocument();
  });
});
