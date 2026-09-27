// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import AdminStayRequestsClient from '@/app/admin/stay-requests/AdminStayRequestsClient';

const id = (n: number) => `73000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function stayRequest(n: number, status = 'DELIVERED') {
  return {
    id: id(n), propertyName: 'Apartment', startDate: '2030-06-01T00:00:00.000Z', endDate: '2030-06-05T00:00:00.000Z',
    firstName: `Guest${n}`, lastName: 'Example', email: `guest${n}@example.invalid`, phone: '+306900000000',
    status, createdAt: '2030-05-01T10:00:00.000Z', outboxEvents: [],
  };
}

function page(requests: unknown[], total: number, nextCursor: string | null) {
  return new Response(JSON.stringify({ success: true, data: { requests, total, nextCursor } }), { status: 200 });
}

describe('admin stay requests list', () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/stay-requests') return page([stayRequest(1), stayRequest(2)], 3, id(2));
      if (url === `/api/admin/stay-requests?cursor=${id(2)}`) return page([stayRequest(3)], 3, null);
      if (url === '/api/admin/stay-requests?status=DELIVERY_FAILED') return page([stayRequest(4, 'DELIVERY_FAILED')], 1, null);
      throw new Error(`unexpected ${url}`);
    });
  });

  it('shows how many of the matching requests are loaded and appends the next page', async () => {
    render(<AdminStayRequestsClient />);

    expect(await screen.findByText('Showing 2 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Showing 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Guest3 Example' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('filters by status from the first page', async () => {
    render(<AdminStayRequestsClient />);
    await screen.findByText('Showing 2 of 3');

    fireEvent.click(screen.getByRole('button', { name: 'Delivery failed' }));

    await waitFor(() => expect(screen.getByText('Showing 1 of 1')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Delivery failed' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('heading', { name: 'Guest1 Example' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry delivery' })).toBeInTheDocument();
  });
});
