// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('next/dynamic', () => ({ default: () => function MapStub() { return null; } }));

import CheckInInfo from '@/components/CheckInInfo';
import { ToastProvider } from '@/components/Toast';

type ArrivalRequest = { id: string; requestedTime: string; status: 'pending' | 'approved' | 'rejected' };

function json(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), { status: 200 });
}

function serve(options: {
  latest: ArrivalRequest | null;
  post?: { request: ArrivalRequest; notification: Record<string, string> };
  postError?: { status: number; message: string };
}) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/check-in/preferences') {
      return json({ checkInTime: '15:00', checkOutTime: '11:00', canEdit: false, wifi: null });
    }
    if (url === '/api/check-in/arrival-request' && init?.method === 'POST' && options.postError) {
      const { status, message } = options.postError;
      return new Response(JSON.stringify({ error: { message } }), { status });
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
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);

    expect(await screen.findByText('Your request has been received and is awaiting confirmation.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request different arrival time' })).not.toBeInTheDocument();
  });

  it('offers a new request once the host has answered', async () => {
    serve({ latest: { ...pending, status: 'rejected' } });
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);

    expect(await screen.findByRole('button', { name: 'Request different arrival time' })).toBeInTheDocument();
  });

  it('says the new time was not sent when the server kept an earlier pending request', async () => {
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);
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
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);
    serve({ latest: null, post: { request: { ...pending, requestedTime: '17:00' }, notification: { status: 'sent' } } });

    fireEvent.click(await screen.findByRole('button', { name: 'Request different arrival time' }));
    fireEvent.change(screen.getByLabelText('Preferred arrival time'), { target: { value: '17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await within(document.getElementById('arrival')!).findByRole('status')).toHaveTextContent('Your request has been sent');
  });

  it('sends the guest to the session refresh page once when the session has expired', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);
    serve({ latest: null, postError: { status: 401, message: 'Authentication required to request an arrival time' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Request different arrival time' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/portal/refresh?next=%2Fen%2Fcheck-in'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Authentication required to request an arrival time')).not.toBeInTheDocument();

    // A second 401 before the page unloads does not start another navigation.
    fireEvent.click(await screen.findByRole('button', { name: 'Send request' }));
    await screen.findByRole('button', { name: 'Send request' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('shows the localized error instead of the server message', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);
    serve({ latest: null, postError: { status: 404, message: 'Not Found' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Request different arrival time' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to send the request. Please try again.');
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('explains that requests are closed once the check-in date has passed', async () => {
    render(<ToastProvider><CheckInInfo locale="en" /></ToastProvider>);
    serve({ latest: null, postError: { status: 409, message: 'Arrival time requests are closed once the stay has started' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Request different arrival time' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your check-in date has passed');
    expect(screen.queryByText('Arrival time requests are closed once the stay has started')).not.toBeInTheDocument();
  });
});
