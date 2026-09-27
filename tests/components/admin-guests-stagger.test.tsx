// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const recorded = vi.hoisted(() => ({ delays: [] as number[] }));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, transition, className }: { children: ReactNode; transition?: { delay?: number }; className?: string }) => {
      if (className?.includes('surface-panel rounded-lg shadow p-6')) recorded.delays.push(transition?.delay ?? 0);
      return <div className={className}>{children}</div>;
    },
  },
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import AdminGuestsPage from '@/app/admin/guests/page';

function booking(n: number) {
  return {
    booking: {
      id: `78000000-0000-4000-8000-${String(n).padStart(12, '0')}`, source: 'ONSITE', provider: 'manual',
      accessStatus: 'PENDING', startDate: '2030-06-01', endDate: '2030-06-05', createdAt: '2030-05-01T00:00:00.000Z',
    },
  };
}

describe('admin guests list animation', () => {
  it('caps the entry stagger so a long list is visible within half a second', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const data = url.includes('action=list')
        ? { bookings: Array.from({ length: 40 }, (_, i) => booking(i + 1)) }
        : url.includes('action=stats') ? { statistics: {} } : { requests: [] };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });

    render(<AdminGuestsPage />);
    await screen.findAllByText(/^Booking 78000000/u);

    const last40 = recorded.delays.slice(-40);
    expect(last40).toHaveLength(40);
    expect(Math.max(...last40)).toBeLessThanOrEqual(0.5);
  });
});
