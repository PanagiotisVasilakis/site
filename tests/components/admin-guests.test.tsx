// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recorded = vi.hoisted(() => ({ delays: [] as number[] }));
const fetchMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());

// MotionConfig exposes its reducedMotion setting; each booking card records its entry delay.
vi.mock('framer-motion', () => ({
  MotionConfig: ({ children, reducedMotion }: { children: ReactNode; reducedMotion?: string }) => (
    <div data-testid="motion-config" data-reduced-motion={reducedMotion}>{children}</div>
  ),
  motion: {
    div: ({ children, transition, className }: { children: ReactNode; transition?: { delay?: number }; className?: string }) => {
      if (className?.includes('admin-card rounded-tile shadow p-6')) recorded.delays.push(transition?.delay ?? 0);
      return <div className={className}>{children}</div>;
    },
  },
}));
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));
vi.mock('@/lib/logger-client', () => ({ logger: { warn: warnMock } }));

import AdminGuestsPage from '@/app/admin/guests/page';

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

describe('admin guests action state', () => {
  const BOOKING_ID = '7a000000-0000-4000-8000-000000000001';

  function listResponse(url: string): Response {
    const data = url.includes('action=list') || url.includes('action=search')
      ? { bookings: [{ booking: { id: BOOKING_ID, source: 'ONSITE', provider: 'manual', accessStatus: 'PENDING', startDate: isoDate(0), endDate: isoDate(2), createdAt: '2030-05-01T00:00:00.000Z' } }] }
      : url.includes('action=stats') ? { statistics: {} } : { requests: [] };
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  }

  let releaseGrant: () => void = () => {};

  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/claim-grants')) {
        await new Promise<void>((resolve) => { releaseGrant = resolve; });
        return new Response(JSON.stringify({ success: true, data: { claimToken: 'token-value', expiresAt: '2099-01-01T00:00:00.000Z' } }), { status: 200 });
      }
      return listResponse(url);
    });
  });

  // The booking here has no externalReference, so this also covers the R-203 fallback
  // of the card title to the booking id.
  it('keeps the bookings list and the Search label while a claim grant is in flight', async () => {
    render(<AdminGuestsPage />);
    const issue = await screen.findByRole('button', { name: 'Issue claim' });

    fireEvent.click(issue);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/claim-grants'), expect.anything()));

    expect(screen.queryByText('Loading bookings...')).not.toBeInTheDocument();
    expect(screen.getByText(`Booking ${BOOKING_ID}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issue claim' })).toBeDisabled();

    releaseGrant();
    expect(await screen.findByText('token-value')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issue claim' })).toBeEnabled();
  });

  it('uses a date input and an encoded, trimmed query for the date search', async () => {
    render(<AdminGuestsPage />);
    await screen.findByText(`Booking ${BOOKING_ID}`);

    fireEvent.change(screen.getByDisplayValue('Booking Reference'), { target: { value: 'date' } });
    const input = screen.getByPlaceholderText('2024-12-25');
    expect(input).toHaveAttribute('type', 'date');

    fireEvent.change(input, { target: { value: '2030-05-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/guests?action=search&startDate=2030-05-02'));
  });
});

describe('admin guests arrival request count', () => {
  it('shows the server-wide pending count, not the count of the loaded rows', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const data = url.includes('action=list')
        ? { bookings: [] }
        : url.includes('action=stats')
          ? { statistics: {} }
          : {
            requests: [{
              id: 'r1', requestedTime: '15:00', status: 'pending',
              createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
            }],
            summary: { total: 9, pending: 7, approved: 1, rejected: 1 },
          };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });

    render(<AdminGuestsPage />);

    expect(await screen.findByText('7 pending requests')).toBeInTheDocument();
  });
});

describe('admin claim token copy', () => {
  const BOOKING_ID = '78000000-0000-4000-8000-000000000001';
  const TOKEN = 'claim-token-value';
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };

  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/claim-grants')) {
        return new Response(JSON.stringify({ success: true, data: { claimToken: TOKEN, expiresAt: '2099-01-01T00:00:00.000Z' } }), { status: 200 });
      }
      const data = url.includes('action=list')
        ? { bookings: [{ booking: { id: BOOKING_ID, source: 'ONSITE', provider: 'manual', accessStatus: 'PENDING', startDate: isoDate(0), endDate: isoDate(2), createdAt: '2030-05-01T00:00:00.000Z' } }] }
        : url.includes('action=stats') ? { statistics: {} } : { requests: [] };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    unhandled.length = 0;
    Reflect.deleteProperty(window.navigator, 'clipboard');
  });

  async function showToken() {
    render(<AdminGuestsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Issue claim' }));
    await screen.findByText(TOKEN);
    return screen.getByRole('button', { name: 'Copy' });
  }

  it('reports a failed copy instead of leaving an unhandled rejection', async () => {
    process.on('unhandledRejection', onUnhandled);
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });

    fireEvent.click(await showToken());

    expect(await screen.findByText('Copy failed, select the token')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(TOKEN);
    expect(warnMock).toHaveBeenCalledWith('Clipboard copy failed', expect.anything());
    expect(unhandled).toEqual([]);
  });

  it('reports a failed copy when the clipboard API is missing', async () => {
    fireEvent.click(await showToken());

    expect(await screen.findByText('Copy failed, select the token')).toBeInTheDocument();
  });

  it('confirms a successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });

    fireEvent.click(await showToken());

    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(TOKEN);
  });
});

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

describe('admin guests reduced motion (identity §9.12)', () => {
  it('wraps the whole page in MotionConfig reducedMotion="user"', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const data = url.includes('action=list') ? { bookings: [] }
        : url.includes('action=stats') ? { statistics: {} } : { requests: [] };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });

    render(<AdminGuestsPage />);
    await screen.findByText('No Bookings Found');

    const config = screen.getByTestId('motion-config');
    expect(config).toHaveAttribute('data-reduced-motion', 'user');
    expect(config).toContainElement(screen.getByRole('main'));
    expect(config).toContainElement(screen.getByRole('heading', { level: 1 }));
  });
});

describe('admin guests booking title', () => {
  const BOOKING_ID = '79000000-0000-4000-8000-000000000001';

  function listBookings(booking: Record<string, unknown>) {
    fetchMock.mockImplementation(async (url: string) => {
      const data = url.includes('action=list')
        ? { bookings: [{ booking: {
          id: BOOKING_ID, source: 'ONSITE', provider: 'manual', accessStatus: 'PENDING',
          startDate: '2026-09-24T00:00:00.000Z', endDate: '2026-09-27T00:00:00.000Z', createdAt: '2026-09-20T10:00:00.000Z',
          ...booking,
        } }] }
        : url.includes('action=stats') ? { statistics: {} } : { requests: [] };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
  }

  it('shows the reference the host entered in the admin form', async () => {
    listBookings({ externalReference: 'HOST-REF-42' });

    render(<AdminGuestsPage />);

    expect(await screen.findByText('Booking HOST-REF-42')).toBeInTheDocument();
    expect(screen.queryByText(`Booking ${BOOKING_ID}`)).not.toBeInTheDocument();
  });
});

describe('admin guests list animation', () => {
  function booking(n: number) {
    return {
      booking: {
        id: `78000000-0000-4000-8000-${String(n).padStart(12, '0')}`, source: 'ONSITE', provider: 'manual',
        accessStatus: 'PENDING', startDate: '2030-06-01', endDate: '2030-06-05', createdAt: '2030-05-01T00:00:00.000Z',
      },
    };
  }

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

describe('admin guests guest info', () => {
  it('shows the guest phone and no longer shows a country origin or e-mail line', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const data = url.includes('action=list')
        ? { bookings: [{
          booking: {
            id: '79000000-0000-4000-8000-000000000002', source: 'ONSITE', provider: 'manual', accessStatus: 'VERIFIED',
            startDate: '2026-09-24T00:00:00.000Z', endDate: '2026-09-27T00:00:00.000Z', createdAt: '2026-09-20T10:00:00.000Z',
          },
          // Fields an older server still sent; the page must not render them.
          user: { id: '77000000-0000-4000-8000-000000000002', phone: '+306912345678', countryOrigin: 'GR', email: 'legacy@example.invalid' },
        }] }
        : url.includes('action=stats') ? { statistics: {} } : { requests: [] };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });

    render(<AdminGuestsPage />);

    expect(await screen.findByText(/\+306912345678/u)).toBeInTheDocument();
    expect(screen.queryByText(/GR$/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/legacy@example\.invalid|Not provided/u)).not.toBeInTheDocument();
  });
});

describe('admin guests create booking', () => {
  // The body of the 422 answer of POST /api/admin/bookings: the generic message plus the issues.
  function validationBody(message: string) {
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { validationErrors: [{ path: 'endDate', message, code: 'custom' }] },
      },
    };
  }

  function mockPage(createResponse?: Response) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/bookings' && createResponse) return createResponse;
      const data = url.includes('action=list') ? { bookings: [] }
        : url.includes('action=stats') ? { statistics: {} } : { requests: [] };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
  }

  async function renderPage() {
    render(<AdminGuestsPage />);
    await screen.findByText('No Bookings Found');
  }

  it('shows the reason of a rejected booking, not the generic validation message', async () => {
    mockPage(new Response(JSON.stringify(validationBody('Check-out must be after check-in')), { status: 422 }));
    await renderPage();

    // The host picked the check-out first and a later check-in afterwards. A click on the submit
    // button would stop at the native min check, so the form is submitted directly.
    fireEvent.change(screen.getByLabelText('Check-out'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Check-in'), { target: { value: '2026-11-05' } });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/bookings', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText('Check-out must be after check-in')).toBeInTheDocument();
    expect(screen.queryByText('Validation failed')).not.toBeInTheDocument();
  });

  it('still shows the server message when the rejection has no validation issues', async () => {
    mockPage(new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'A booking with this reference already exists' } }), { status: 409 }));
    await renderPage();

    fireEvent.change(screen.getByLabelText('Check-in'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Check-out'), { target: { value: '2026-11-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create booking' }));

    expect(await screen.findByText('A booking with this reference already exists')).toBeInTheDocument();
  });

  it('starts the check-out picker the day after check-in', async () => {
    mockPage();
    await renderPage();
    const checkOut = screen.getByLabelText('Check-out');
    expect(checkOut).not.toHaveAttribute('min');

    fireEvent.change(screen.getByLabelText('Check-in'), { target: { value: '2026-11-30' } });
    expect(checkOut).toHaveAttribute('min', '2026-12-01');

    fireEvent.change(checkOut, { target: { value: '2026-11-30' } });
    expect(checkOut).toBeInvalid();
    fireEvent.change(checkOut, { target: { value: '2026-12-01' } });
    expect(checkOut).toBeValid();
  });

  it('leaves the check-out picker open when check-in is the last supported day', async () => {
    mockPage();
    await renderPage();

    fireEvent.change(screen.getByLabelText('Check-in'), { target: { value: '9999-12-31' } });

    expect(screen.getByLabelText('Check-out')).not.toHaveAttribute('min');
  });
});
