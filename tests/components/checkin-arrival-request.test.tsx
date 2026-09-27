// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('next/dynamic', () => ({ default: () => function MapStub() { return null; } }));

import CheckInInfo from '@/components/CheckInInfo';

type ArrivalRequest = { id: string; requestedTime: string; status: 'pending' | 'approved' | 'rejected' };

function json(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), { status: 200 });
}

function serve(options: { latest: ArrivalRequest | null; post?: { request: ArrivalRequest; notification: Record<string, string> } }) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/check-in/preferences') {
      return json({ checkInTime: '15:00', checkOutTime: '11:00', canEdit: false, wifi: null });
    }
    if (url === '/api/check-in/arrival-request' && init?.method === 'POST' && options.post) return json(options.post);
    if (url === '/api/check-in/arrival-request') return json({ request: options.latest });
    throw new Error(`unexpected ${url}`);
  });
}

const pending: ArrivalRequest = { id: 'r1', requestedTime: '16:30', status: 'pending' };

describe('check-in arrival-time request', () => {
  beforeEach(() => {
    serve({ latest: null });
  });

  it('hides the request button while the latest request awaits confirmation', async () => {
    serve({ latest: pending });
    render(<CheckInInfo locale="en" />);

    expect(await screen.findByText('Your request has been received and is awaiting confirmation.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request different arrival time' })).not.toBeInTheDocument();
  });

  it('offers a new request once the host has answered', async () => {
    serve({ latest: { ...pending, status: 'rejected' } });
    render(<CheckInInfo locale="en" />);

    expect(await screen.findByRole('button', { name: 'Request different arrival time' })).toBeInTheDocument();
  });

  it('says the new time was not sent when the server kept an earlier pending request', async () => {
    render(<CheckInInfo locale="en" />);
    // Another tab sent a request after this page loaded.
    serve({ latest: null, post: { request: pending, notification: { status: 'skipped', reason: 'request_already_pending' } } });

    fireEvent.click(await screen.findByRole('button', { name: 'Request different arrival time' }));
    fireEvent.change(screen.getByLabelText('Preferred arrival time'), { target: { value: '17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('the new time was not sent');
    expect(screen.queryByText("Your request has been sent. We'll confirm availability as soon as possible.")).not.toBeInTheDocument();
    expect(screen.getByText('16:30')).toBeInTheDocument();
  });

  it('confirms a request the server accepted', async () => {
    render(<CheckInInfo locale="en" />);
    serve({ latest: null, post: { request: { ...pending, requestedTime: '17:00' }, notification: { status: 'sent' } } });

    fireEvent.click(await screen.findByRole('button', { name: 'Request different arrival time' }));
    fireEvent.change(screen.getByLabelText('Preferred arrival time'), { target: { value: '17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Your request has been sent');
  });
});
