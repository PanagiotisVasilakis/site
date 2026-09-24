import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Booking } from '@/lib/guestDataStore';

const guestStore = vi.hoisted(() => ({
  getAllBookings: vi.fn(),
  getAllUsers: vi.fn(),
  getAllCheckins: vi.fn(),
  findBookingById: vi.fn(),
  findUserById: vi.fn(),
  getCheckinCompletionByBooking: vi.fn(),
}));

vi.mock('@/lib/guestDataStore', () => ({ guestStore }));

import { guestDataExport } from '@/lib/guestDataExport';

// Mirrors domainMappers: PostgreSQL DATE columns arrive as UTC-midnight ISO datetimes.
function booking(id: string, start: string, end: string): Booking {
  return {
    id,
    source: 'EXTERNAL',
    start_date: new Date(`${start}T00:00:00Z`).toISOString(),
    end_date: new Date(`${end}T00:00:00Z`).toISOString(),
    provider: 'test',
    access_status: 'PENDING',
    created_at: 0,
  };
}

const bookings = [
  booking('starts-on-day', '2030-07-14', '2030-07-16'),
  booking('ends-on-day', '2030-07-10', '2030-07-14'),
  booking('spans-day', '2030-07-12', '2030-07-18'),
  booking('starts-on-range-end', '2030-07-20', '2030-07-22'),
  booking('outside', '2030-08-01', '2030-08-03'),
];

beforeEach(() => {
  guestStore.getAllBookings.mockResolvedValue(bookings);
  guestStore.getAllUsers.mockResolvedValue([]);
  guestStore.getAllCheckins.mockResolvedValue([]);
  guestStore.findBookingById.mockImplementation(async (id: string) => bookings.find((b) => b.id === id) ?? null);
  guestStore.findUserById.mockResolvedValue(null);
  guestStore.getCheckinCompletionByBooking.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('guest data export date handling', () => {
  it('matches bookings that start, end or span a searched date', async () => {
    const result = await guestDataExport.searchBookingsByDateRange('2030-07-14');
    expect(result.map((entry) => entry.booking.id).sort()).toEqual(['ends-on-day', 'spans-day', 'starts-on-day']);
  });

  it('includes bookings starting on the last day of a searched range', async () => {
    const result = await guestDataExport.searchBookingsByDateRange('2030-07-14', '2030-07-20');
    expect(result.map((entry) => entry.booking.id).sort()).toEqual(['starts-on-day', 'starts-on-range-end']);
  });

  it('joins users and check-ins from their lists without per-booking lookups', async () => {
    guestStore.getAllBookings.mockResolvedValue([
      { ...booking('with-guest', '2030-07-14', '2030-07-16'), user_id: 'user-1' },
      booking('without-guest', '2030-07-20', '2030-07-22'),
    ]);
    guestStore.getAllUsers.mockResolvedValue([
      { id: 'user-1', phone_e164: '+12025550100', country_origin: 'GR', created_at: 0, updated_at: 0 },
    ]);
    guestStore.getAllCheckins.mockResolvedValue([
      { booking_id: 'with-guest', arrival_time: '15:00', accepted_at: 0 },
    ]);

    const result = await guestDataExport.getAllBookings();

    expect(result.map((entry) => [entry.booking.id, entry.user?.phone, entry.checkin?.arrivalTime])).toEqual([
      ['with-guest', '+12025550100', '15:00'],
      ['without-guest', undefined, undefined],
    ]);
    expect(guestStore.findBookingById).not.toHaveBeenCalled();
    expect(guestStore.findUserById).not.toHaveBeenCalled();
    expect(guestStore.getCheckinCompletionByBooking).not.toHaveBeenCalled();
  });

  it('counts a booking that starts today as active', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-07-14T12:00:00Z'));
    guestStore.getAllBookings.mockResolvedValue([booking('starts-today', '2030-07-14', '2030-07-16')]);

    const stats = await guestDataExport.getStatistics();
    expect(stats.bookingsByStatus).toEqual({ active: 1 });
  });
});
