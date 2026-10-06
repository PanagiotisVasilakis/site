// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The component builds its time formatter when the module loads, so the zone
// is pinned before the import to one whose offset differs from Athens.
vi.hoisted(() => {
  vi.stubEnv('TZ', 'UTC');
});
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/internalFetchClient', () => ({ default: fetchMock }));

import AdminAvailabilityClient from '@/app/admin/availability/AdminAvailabilityClient';

const PERIOD_A = '6f1d8f5e-0c55-4d7c-9a3e-3f1b2a4c5d6e';
const PERIOD_B = '2b7c9d1e-8f4a-4b6c-a5d3-7e9f1a2b3c4d';

type Handler = (init: RequestInit | undefined) => Promise<Response> | Response;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const ok = (data: unknown, status = 200) => json({ success: true, data }, status);
const failure = (status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>) =>
  json({ error: { code, message, details, timestamp: '2026-09-28T10:00:00.000Z' } }, status, headers);

function syncState(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
    lastSuccessAt: '2026-09-28T09:00:00.000Z',
    lastAttemptAt: '2026-09-28T09:05:00.000Z',
    lastFailureAt: null,
    lastErrorCode: null,
    lastHttpStatus: null,
    consecutiveFailures: 0,
    nights: 3,
    horizonStart: '2026-09-28',
    horizonEnd: '2027-09-28',
    nextAttemptAt: '2026-09-28T09:35:00.000Z',
    stale: false,
    ...overrides,
  };
}

let periods: unknown[];
let status: Record<string, unknown>;
let routes: Record<string, Handler>;

function key(url: string, init?: RequestInit) {
  return `${init?.method ?? 'GET'} ${url}`;
}

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function sentBody(method: string, url: string) {
  const call = fetchMock.mock.calls.find(([calledUrl, init]) => calledUrl === url && init?.method === method);
  return call ? JSON.parse(call[1].body as string) : undefined;
}

async function renderLoaded() {
  render(<AdminAvailabilityClient />);
  await screen.findByRole('table', { name: 'Rate periods' });
  await screen.findByText('Configured');
}

function fillForm(values: { first?: string; last?: string; price?: string; minimum?: string }) {
  if (values.first !== undefined) fireEvent.change(screen.getByLabelText('First night'), { target: { value: values.first } });
  if (values.last !== undefined) fireEvent.change(screen.getByLabelText('Last night'), { target: { value: values.last } });
  if (values.price !== undefined) fireEvent.change(screen.getByLabelText('Price per night (€)'), { target: { value: values.price } });
  if (values.minimum !== undefined) fireEvent.change(screen.getByLabelText('Minimum nights'), { target: { value: values.minimum } });
}

describe('admin availability & prices', () => {
  beforeEach(() => {
    periods = [
      { id: PERIOD_B, startDate: '2026-12-01', endDate: '2027-01-01', nightlyPriceCents: 9_000, minimumNights: 3 },
      { id: PERIOD_A, startDate: '2026-11-01', endDate: '2026-11-05', nightlyPriceCents: 8_550, minimumNights: 2 },
    ];
    status = syncState();
    routes = {
      'GET /api/admin/rate-periods': () => ok({ ratePeriods: periods }),
      'GET /api/admin/availability-sync': () => ok(status),
      'POST /api/admin/rate-periods': () => ok({ ratePeriod: {} }, 201),
      [`PUT /api/admin/rate-periods/${PERIOD_A}`]: () => ok({ ratePeriod: {} }),
      [`DELETE /api/admin/rate-periods/${PERIOD_A}`]: () => ok({ id: PERIOD_A }),
      'POST /api/admin/availability-sync': () => ok({ status: 'synced', nights: 12 }),
    };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const handler = routes[key(url, init)];
      if (!handler) throw new Error(`unexpected ${key(url, init)}`);
      return handler(init);
    });
  });

  describe('rate periods', () => {
    it('lists the periods by first night with the inclusive last night and the formatted price', async () => {
      await renderLoaded();

      const rows = within(screen.getByRole('table', { name: 'Rate periods' })).getAllByRole('row').slice(1);
      expect(rows.map((row) => within(row).getAllByRole('cell').slice(0, 4).map((cell) => cell.textContent))).toEqual([
        ['2026-11-01', '2026-11-04', '€85.50', '2'],
        ['2026-12-01', '2026-12-31', '€90.00', '3'],
      ]);
    });

    it('sends the last night as the exclusive end date and the price in cents', async () => {
      await renderLoaded();

      fillForm({ first: '2026-10-01', last: '2026-10-31', price: '85,50', minimum: '2' });
      fireEvent.click(screen.getByRole('button', { name: 'Add rate period' }));

      await waitFor(() => expect(sentBody('POST', '/api/admin/rate-periods')).toEqual({
        startDate: '2026-10-01',
        endDate: '2026-11-01',
        nightlyPriceCents: 8_550,
        minimumNights: 2,
      }));
      expect(await screen.findByText('Rate period saved.')).toBeInTheDocument();
    });

    it.each([
      ['85', 8_500],
      ['85.50', 8_550],
      ['85,5', 8_550],
    ])('accepts the price %s as %i cents', async (price, cents) => {
      await renderLoaded();

      fillForm({ first: '2026-10-01', last: '2026-10-01', price, minimum: '1' });
      fireEvent.click(screen.getByRole('button', { name: 'Add rate period' }));

      await waitFor(() => expect(sentBody('POST', '/api/admin/rate-periods')?.nightlyPriceCents).toBe(cents));
    });

    it.each([
      ['a missing first night', { first: '', last: '2026-10-31', price: '85', minimum: '2' }, 'Enter the first night.'],
      ['a last night before the first', { first: '2026-10-10', last: '2026-10-09', price: '85', minimum: '2' }, 'The last night cannot be before the first night.'],
      ['a price with three decimals', { first: '2026-10-01', last: '2026-10-31', price: '85.555', minimum: '2' }, 'Enter a price such as 85, 85.50 or 85,50.'],
      ['a price below €1', { first: '2026-10-01', last: '2026-10-31', price: '0,99', minimum: '2' }, 'The price must be between €1.00 and €10,000.00.'],
      ['a minimum of 31 nights', { first: '2026-10-01', last: '2026-10-31', price: '85', minimum: '31' }, 'Minimum nights must be a whole number from 1 to 30.'],
      ['a minimum of 0 nights', { first: '2026-10-01', last: '2026-10-31', price: '85', minimum: '0' }, 'Minimum nights must be a whole number from 1 to 30.'],
    ])('explains %s without calling the API', async (_label, values, message) => {
      await renderLoaded();

      fillForm(values);
      fireEvent.click(screen.getByRole('button', { name: 'Add rate period' }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(sentBody('POST', '/api/admin/rate-periods')).toBeUndefined();
    });

    it('shows the overlap message of the API', async () => {
      routes['POST /api/admin/rate-periods'] = () => failure(409, 'CONFLICT', 'The dates overlap an existing rate period');
      await renderLoaded();

      fillForm({ first: '2026-11-03', last: '2026-11-10', price: '85', minimum: '2' });
      fireEvent.click(screen.getByRole('button', { name: 'Add rate period' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('The dates overlap an existing rate period');
    });

    it('disables the form and the row actions while a save is pending', async () => {
      const pending = deferred();
      routes['POST /api/admin/rate-periods'] = () => pending.promise;
      await renderLoaded();

      fillForm({ first: '2026-10-01', last: '2026-10-31', price: '85', minimum: '2' });
      fireEvent.click(screen.getByRole('button', { name: 'Add rate period' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Add rate period' })).toBeDisabled());
      expect(screen.getByRole('button', { name: 'Edit 2026-11-01 to 2026-11-04' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Delete 2026-11-01 to 2026-11-04' })).toBeDisabled();

      await act(async () => pending.resolve(ok({ ratePeriod: {} }, 201)));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Add rate period' })).toBeEnabled());
      expect(screen.getByRole('button', { name: 'Edit 2026-11-01 to 2026-11-04' })).toBeEnabled();
    });

    it('edits a period with its inclusive last night and saves it with PUT', async () => {
      await renderLoaded();

      fireEvent.click(screen.getByRole('button', { name: 'Edit 2026-11-01 to 2026-11-04' }));
      expect(screen.getByLabelText('First night')).toHaveValue('2026-11-01');
      expect(screen.getByLabelText('Last night')).toHaveValue('2026-11-04');
      expect(screen.getByLabelText('Price per night (€)')).toHaveValue('85.50');
      expect(screen.getByLabelText('Minimum nights')).toHaveValue(2);

      fillForm({ last: '2026-11-06', price: '88' });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(sentBody('PUT', `/api/admin/rate-periods/${PERIOD_A}`)).toEqual({
        startDate: '2026-11-01',
        endDate: '2026-11-07',
        nightlyPriceCents: 8_800,
        minimumNights: 2,
      }));
    });

    it('asks for confirmation before deleting', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      await renderLoaded();

      fireEvent.click(screen.getByRole('button', { name: 'Delete 2026-11-01 to 2026-11-04' }));

      expect(confirm).toHaveBeenCalledWith('Delete the rate period 2026-11-01 to 2026-11-04 (€85.50 per night)?');
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);

      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: 'Delete 2026-11-01 to 2026-11-04' }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/rate-periods/${PERIOD_A}`,
        expect.objectContaining({ method: 'DELETE' }),
      ));
    });

    it('keeps the saved message when the list reload fails', async () => {
      await renderLoaded();
      routes['GET /api/admin/rate-periods'] = () => failure(401, 'UNAUTHORIZED', 'Authentication required');

      fillForm({ first: '2026-10-01', last: '2026-10-31', price: '85', minimum: '2' });
      fireEvent.click(screen.getByRole('button', { name: 'Add rate period' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Authentication required');
      expect(screen.getByText('Rate period saved.')).toBeInTheDocument();
    });

    it('keeps the deleted message when the list reload fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await renderLoaded();
      routes['GET /api/admin/rate-periods'] = () => failure(401, 'UNAUTHORIZED', 'Authentication required');

      fireEvent.click(screen.getByRole('button', { name: 'Delete 2026-11-01 to 2026-11-04' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Authentication required');
      expect(screen.getByText('Rate period deleted.')).toBeInTheDocument();
    });
  });

  describe('calendar sync', () => {
    it('shows the calendar range with the last night, not the exclusive end', async () => {
      await renderLoaded();

      const panel = screen.getByRole('region', { name: 'Airbnb calendar sync' });
      expect(within(panel).getByText('2026-09-28 to 2027-09-27')).toBeInTheDocument();
    });

    it('shows the sync state with times in Europe/Athens and no URL', async () => {
      await renderLoaded();

      const panel = screen.getByRole('region', { name: 'Airbnb calendar sync' });
      // 09:00 UTC is 12:00 in Athens (EEST, UTC+3).
      expect(within(panel).getByText(/12:00/)).toBeInTheDocument();
      expect(within(panel).queryByText(/09:00/)).not.toBeInTheDocument();
      expect(within(panel).getByText('3')).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/https?:\/\//);
      expect(document.body.textContent?.toLowerCase()).not.toContain('airbnb.com');
    });

    it('clears a failed sync state load once a reload succeeds', async () => {
      routes['GET /api/admin/availability-sync'] = () => failure(500, 'INTERNAL_ERROR', 'Unable to load the calendar sync state');
      render(<AdminAvailabilityClient />);
      expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load the calendar sync state');

      routes['GET /api/admin/availability-sync'] = () => ok(status);
      fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

      expect(await screen.findByText('Synced: 12 blocked nights.')).toBeInTheDocument();
      expect(await screen.findByText('Configured')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('explains how to configure a missing calendar', async () => {
      status = syncState({ configured: false, lastSuccessAt: null, lastAttemptAt: null, nights: 0 });
      render(<AdminAvailabilityClient />);

      expect(await screen.findByText('Not configured')).toBeInTheDocument();
      expect(screen.getByText('Set AIRBNB_ICAL_URL in the production environment')).toBeInTheDocument();
    });

    it('warns when the calendar is stale and shows the last error', async () => {
      status = syncState({ stale: true, lastFailureAt: '2026-09-28T09:05:00.000Z', lastErrorCode: 'http_status', lastHttpStatus: 503 });
      await renderLoaded();

      expect(screen.getByText('The calendar has not synced successfully in the last 12 hours.')).toBeInTheDocument();
      expect(screen.getByText('http_status (HTTP 503)')).toBeInTheDocument();
    });

    it('disables Sync now while pending and reports a successful sync', async () => {
      const pending = deferred();
      routes['POST /api/admin/availability-sync'] = () => pending.promise;
      await renderLoaded();

      fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Sync/ })).toBeDisabled());
      expect(sentBody('POST', '/api/admin/availability-sync')).toEqual({});

      await act(async () => pending.resolve(ok({ status: 'synced', nights: 12 })));
      expect(await screen.findByText('Synced: 12 blocked nights.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled();
    });

    it.each([
      [
        '429',
        () => failure(429, 'RATE_LIMITED', 'A manual sync ran less than a minute ago', { retryAfter: 40 }, { 'retry-after': '40' }),
        'A sync ran less than a minute ago. Try again in 40 seconds.',
      ],
      [
        '409 busy',
        () => failure(409, 'CONFLICT', 'Another calendar sync is in progress'),
        'Another calendar sync is in progress',
      ],
      [
        '502',
        () => failure(502, 'EXTERNAL_SERVICE_ERROR', 'The calendar sync failed', { code: 'http_status', httpStatus: 503 }),
        'The Airbnb calendar could not be read (http_status, HTTP 503). The last good calendar is kept.',
      ],
    ])('describes a %s outcome in words', async (_label, response, message) => {
      routes['POST /api/admin/availability-sync'] = response;
      await renderLoaded();

      fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

      expect(await screen.findByText(message)).toBeInTheDocument();
    });
  });
});
