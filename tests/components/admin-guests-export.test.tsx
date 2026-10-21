// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('framer-motion', () => ({
  MotionConfig: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  motion: {
    div: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
  },
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/logger-client', () => ({ logger: { warn: vi.fn() } }));

import AdminGuestsPage from '@/app/admin/guests/page';

const BOOKING_ID = '7c000000-0000-4000-8000-000000000001';
const USER_ID = '77000000-0000-4000-8000-0000000000c1';

// One claimed booking, as the list action delivers it; `exportResponse` answers the export action.
function mockPage(exportResponse: Response) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('action=export')) return exportResponse;
    const data = url.includes('action=list')
      ? { bookings: [{
        booking: {
          id: BOOKING_ID, source: 'ONSITE', provider: 'manual', accessStatus: 'VERIFIED',
          startDate: '2030-09-01T00:00:00.000Z', endDate: '2030-09-03T00:00:00.000Z', createdAt: '2030-05-01T00:00:00.000Z',
        },
        user: { id: USER_ID, phone: '+306912345678' },
      }] }
      : url.includes('action=stats') ? { statistics: {} } : { requests: [] };
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  });
}

describe('admin guests export button', () => {
  const downloads: Array<{ href: string; name: string }> = [];
  const createObjectURL = vi.fn();
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    downloads.length = 0;
    createObjectURL.mockReturnValue('blob:guest-data');
    // jsdom has no object URLs and does not navigate; the page only needs both to exist.
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      downloads.push({ href: this.href, name: this.download });
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('says that it exports all data of the guest, not only the booking', async () => {
    mockPage(new Response('{}', { status: 200 }));
    render(<AdminGuestsPage />);

    const button = await screen.findByRole('button', { name: 'Export all guest data' });

    expect(button).toHaveAttribute('title', expect.stringContaining('every booking'));
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });

  it('downloads the complete export of the guest of the booking as a JSON file', async () => {
    const file = JSON.stringify({ booking: { id: BOOKING_ID }, checkInRequests: [] });
    mockPage(new Response(file, { status: 200 }));
    render(<AdminGuestsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Export all guest data' }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/guests?action=export&bookingId=${BOOKING_ID}`);
    // The file is the response body as it came, not a re-serialisation of a part of it.
    expect(await (createObjectURL.mock.calls[0][0] as Blob).text()).toBe(file);
    expect(downloads[0].href).toBe('blob:guest-data');
    expect(downloads[0].name).toMatch(new RegExp(`^guest_data_${BOOKING_ID}_\\d+\\.json$`, 'u'));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:guest-data');
    expect(screen.queryByText('Export failed')).not.toBeInTheDocument();
  });

  it('reports a failed export and downloads nothing', async () => {
    mockPage(new Response('{}', { status: 500 }));
    render(<AdminGuestsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Export all guest data' }));

    expect(await screen.findByText('Export failed')).toBeInTheDocument();
    expect(downloads).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
