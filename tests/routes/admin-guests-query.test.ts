import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  getAllBookings: vi.fn(),
  getCompleteGuestExport: vi.fn(),
  searchBookingsByDateRange: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/guestDataExport', () => ({
  guestDataExport: {
    getAllBookings: mocks.getAllBookings,
    getCompleteGuestExport: mocks.getCompleteGuestExport,
    searchBookingsByDateRange: mocks.searchBookingsByDateRange,
  },
}));

import { GET } from '@/app/api/admin/guests/route';

const BOOKING_ID = '4c939e37-ef9f-4fb2-8231-319896c89080';

function get(query: string, headers: Record<string, string> = {}): Promise<Response> {
  return GET(
    new NextRequest(`http://localhost:3000/api/admin/guests?${query}`, { headers }),
    { params: Promise.resolve({}) },
  );
}

describe('admin guests route query validation', () => {
  beforeEach(() => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.getCompleteGuestExport.mockResolvedValue({ booking: { id: BOOKING_ID }, user: null, checkInRequests: [] });
    mocks.searchBookingsByDateRange.mockResolvedValue([]);
  });

  it('answers 404 for a malformed export bookingId without looking it up', async () => {
    const response = await get('action=export&bookingId=not-a-uuid');

    expect(response.status).toBe(404);
    expect(mocks.getCompleteGuestExport).not.toHaveBeenCalled();
  });

  it('exports everything stored about the guest of a well-formed bookingId as a no-store download', async () => {
    const response = await get(`action=export&bookingId=${BOOKING_ID}`);

    expect(response.status).toBe(200);
    expect(mocks.getCompleteGuestExport).toHaveBeenCalledWith(BOOKING_ID);
    expect(response.headers.get('content-disposition')).toMatch(new RegExp(`^attachment; filename="guest_data_${BOOKING_ID}_\\d+\\.json"$`, 'u'));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ booking: { id: BOOKING_ID }, user: null, checkInRequests: [] });
  });

  it('answers 404 for a well-formed but unknown export bookingId', async () => {
    mocks.getCompleteGuestExport.mockResolvedValue(null);

    const response = await get(`action=export&bookingId=${BOOKING_ID}`);

    expect(response.status).toBe(404);
    expect(mocks.getCompleteGuestExport).toHaveBeenCalledWith(BOOKING_ID);
  });

  it('accepts an export requested by a page of the same origin', async () => {
    const response = await get(`action=export&bookingId=${BOOKING_ID}`, { origin: 'http://localhost:3000', host: 'localhost:3000' });

    expect(response.status).toBe(200);
  });

  it.each([
    ['a foreign origin', { origin: 'https://evil.example', host: 'localhost:3000' }],
    ['an opaque origin', { origin: 'null', host: 'localhost:3000' }],
  ])('answers 403 to an export requested from %s without reading guest data', async (_label, headers) => {
    const response = await get(`action=export&bookingId=${BOOKING_ID}`, headers);

    expect(response.status).toBe(403);
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(mocks.getCompleteGuestExport).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown action', 'action=delete'],
    ['a missing action', ''],
    ['an export without bookingId', 'action=export'],
  ])('answers 422 for %s', async (_label, query) => {
    const response = await get(query);

    expect(response.status).toBe(422);
    expect(mocks.getCompleteGuestExport).not.toHaveBeenCalled();
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
      expect(mocks.getCompleteGuestExport).not.toHaveBeenCalled();
    },
  );
});
