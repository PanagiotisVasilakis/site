import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  getBookingDetails: vi.fn(),
  searchBookingsByDateRange: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/guestDataExport', () => ({
  guestDataExport: {
    getBookingDetails: mocks.getBookingDetails,
    searchBookingsByDateRange: mocks.searchBookingsByDateRange,
  },
}));

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

  it.each([
    ['startDate=2026-10-5'],
    ['startDate=25/12/2024'],
    ['startDate=2026-10-05&endDate=2026-10-5'],
  ])('answers 422 for a malformed search date (%s) without searching', async (dates) => {
    const response = await get(`action=search&${dates}`);

    expect(response.status).toBe(422);
    expect(mocks.searchBookingsByDateRange).not.toHaveBeenCalled();
  });

  it('searches with well-formed dates', async () => {
    const onlyStart = await get('action=search&startDate=2026-10-05');
    expect(onlyStart.status).toBe(200);
    expect(mocks.searchBookingsByDateRange).toHaveBeenLastCalledWith('2026-10-05', undefined);

    const range = await get('action=search&startDate=2026-10-05&endDate=2026-10-12');
    expect(range.status).toBe(200);
    expect(mocks.searchBookingsByDateRange).toHaveBeenLastCalledWith('2026-10-05', '2026-10-12');
  });
});
