import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  getAllBookings: vi.fn(),
  getBookingDetails: vi.fn(),
  searchBookingsByDateRange: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/guestDataExport', () => ({
  guestDataExport: {
    getAllBookings: mocks.getAllBookings,
    getBookingDetails: mocks.getBookingDetails,
    searchBookingsByDateRange: mocks.searchBookingsByDateRange,
  },
}));
vi.mock('@/lib/logger-enterprise', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logger-enterprise')>();
  return {
    ...actual,
    logger: {
      ...actual.logger,
      error: mocks.loggerError,
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      getContext: actual.logger.getContext.bind(actual.logger),
      setContext: actual.logger.setContext.bind(actual.logger),
    },
  };
});

import { GET } from '@/app/api/admin/guests/route';

const BOOKING_ID = '4c939e37-ef9f-4fb2-8231-319896c89080';

function get(query: string): Promise<Response> {
  return GET(
    new NextRequest(`http://localhost:3000/api/admin/guests?${query}`),
    { params: Promise.resolve({}) },
  );
}

describe('admin guests route query validation', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.getBookingDetails.mockResolvedValue({ id: BOOKING_ID });
    mocks.searchBookingsByDateRange.mockResolvedValue([]);
  });

  it('answers 404 for a malformed export bookingId without looking it up', async () => {
    const response = await get('action=export&bookingId=not-a-uuid');

    expect(response.status).toBe(404);
    expect(mocks.getBookingDetails).not.toHaveBeenCalled();
  });

  it('exports a booking for a well-formed bookingId', async () => {
    const response = await get(`action=export&bookingId=${BOOKING_ID}`);

    expect(response.status).toBe(200);
    expect(mocks.getBookingDetails).toHaveBeenCalledWith(BOOKING_ID);
    expect(response.headers.get('content-disposition')).toContain(`booking_${BOOKING_ID}_`);
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 404 for a well-formed but unknown export bookingId', async () => {
    mocks.getBookingDetails.mockResolvedValue(null);

    const response = await get(`action=export&bookingId=${BOOKING_ID}`);

    expect(response.status).toBe(404);
    expect(mocks.getBookingDetails).toHaveBeenCalledWith(BOOKING_ID);
  });

  it.each([
    ['an unknown action', 'action=delete'],
    ['a missing action', ''],
    ['an export without bookingId', 'action=export'],
  ])('answers 422 for %s', async (_label, query) => {
    const response = await get(query);

    expect(response.status).toBe(422);
    expect(mocks.getBookingDetails).not.toHaveBeenCalled();
  });

  it('answers 422 for a malformed search date (startDate=2026-10-5) without searching', async () => {
    const response = await get('action=search&startDate=2026-10-5');

    expect(response.status).toBe(422);
    expect(mocks.searchBookingsByDateRange).not.toHaveBeenCalled();
  });

  it('searches with a well-formed start date', async () => {
    const response = await get('action=search&startDate=2026-10-05');
    expect(response.status).toBe(200);
    expect(mocks.searchBookingsByDateRange).toHaveBeenLastCalledWith('2026-10-05');
  });

  it.each(['action=list', `action=export&bookingId=${BOOKING_ID}`])(
    'answers 401 to a non-admin (%s) without reading guest data',
    async (query) => {
      mocks.isAdminRequest.mockResolvedValue(false);
      // A resolved value, so that a missing gate shows up as a 200 and not as a TypeError.
      mocks.getAllBookings.mockResolvedValue([]);

      const response = await get(query);

      expect(response.status).toBe(401);
      expect(mocks.isAdminRequest).toHaveBeenCalledOnce();
      expect(mocks.getAllBookings).not.toHaveBeenCalled();
      expect(mocks.getBookingDetails).not.toHaveBeenCalled();
    },
  );

  it('logs unexpected failures at error level without echoing internal messages', async () => {
    mocks.getAllBookings.mockRejectedValue(new Error('relation "bookings" does not exist'));

    const response = await GET(
      new NextRequest('https://guest-guide.test/api/admin/guests?action=list'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('does not exist');
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Unexpected API error',
      expect.any(Object),
      expect.objectContaining({ message: 'relation "bookings" does not exist' }),
    );
  });
});
