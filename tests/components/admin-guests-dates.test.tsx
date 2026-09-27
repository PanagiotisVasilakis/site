// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div> },
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import AdminGuestsPage from '@/app/admin/guests/page';

describe('admin guests booking dates', () => {
  it('shows stay dates as calendar dates, independent of the browser time zone', async () => {
    // West of UTC, a UTC-midnight date read as local time falls on the previous day.
    vi.stubEnv('TZ', 'America/New_York');
    fetchMock.mockImplementation(async (url: string) => {
      const data = url.includes('action=list')
        ? { bookings: [{ booking: {
          id: '78000000-0000-4000-8000-000000000001', source: 'ONSITE', provider: 'manual', accessStatus: 'PENDING',
          startDate: '2026-09-24T00:00:00.000Z', endDate: '2026-09-27T00:00:00.000Z', createdAt: '2026-09-20T10:00:00.000Z',
        } }] }
        : url.includes('action=stats') ? { statistics: {} } : { requests: [] };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });

    render(<AdminGuestsPage />);
    await screen.findByText(/^Booking 78000000/u);

    const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { timeZone: 'UTC' });
    expect(screen.getByText(`${day('2026-09-24T00:00:00.000Z')} to ${day('2026-09-27T00:00:00.000Z')}`)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('T00:00:00.000Z');
    expect(day('2026-09-24T00:00:00.000Z')).not.toBe(new Date('2026-09-24T00:00:00.000Z').toLocaleDateString());
  });
});
