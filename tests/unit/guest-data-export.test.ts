import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Booking } from '@/lib/guestDataStore';

const guestStore = vi.hoisted(() => ({
  getAllBookings: vi.fn(),
  findBookingsByUserId: vi.fn(),
  findBookingsOnDate: vi.fn(),
  findUsersByIds: vi.fn(),
  findUserByPhone: vi.fn(),
  findBookingById: vi.fn(),
  findBookingByReference: vi.fn(),
  findUserById: vi.fn(),
  getStatistics: vi.fn(),
}));

vi.mock('@/lib/guestDataStore', () => ({ guestStore }));

import { guestDataExport } from '@/lib/guestDataExport';

// PostgreSQL DATE columns arrive from Prisma as UTC-midnight Dates.
function booking(id: string, start: string, end: string): Booking {
  return {
    id,
    source: 'EXTERNAL',
    startDate: new Date(`${start}T00:00:00Z`),
    endDate: new Date(`${end}T00:00:00Z`),
    userId: null,
    provider: 'test',
    externalReference: null,
    accessStatus: 'PENDING',
    claimedAt: null,
    createdAt: new Date(0),
  };
}

const bookings = [
  booking('starts-on-day', '2030-07-14', '2030-07-16'),
  booking('ends-on-day', '2030-07-10', '2030-07-14'),
  booking('spans-day', '2030-07-12', '2030-07-18'),
  booking('outside', '2030-08-01', '2030-08-03'),
];

beforeEach(() => {
  guestStore.getAllBookings.mockResolvedValue(bookings);
  guestStore.findBookingsOnDate.mockImplementation(async (date: Date) => (
    bookings.filter((entry) => entry.startDate <= date && entry.endDate >= date)
  ));
  guestStore.findBookingsByUserId.mockResolvedValue([]);
  guestStore.findUsersByIds.mockResolvedValue([]);
  guestStore.findBookingById.mockImplementation(async (id: string) => bookings.find((b) => b.id === id) ?? null);
  guestStore.findBookingByReference.mockResolvedValue(null);
  guestStore.findUserById.mockResolvedValue(null);
  guestStore.getStatistics.mockResolvedValue({ totalBookings: 4, totalUsers: 1, totalClaimedBookings: 1 });
});

describe('guest data export date handling', () => {
  it('queries bookings matching the target date directly without scanning all bookings', async () => {
    const result = await guestDataExport.searchBookingsByDateRange('2030-07-14');
    expect(result.map((entry) => entry.booking.id).sort()).toEqual(['ends-on-day', 'spans-day', 'starts-on-day']);
    expect(guestStore.findBookingsOnDate).toHaveBeenCalledExactlyOnceWith(new Date('2030-07-14T00:00:00Z'));
    expect(guestStore.getAllBookings).not.toHaveBeenCalled();
  });

  it('joins only the referenced users in one filtered batch query', async () => {
    guestStore.getAllBookings.mockResolvedValue([
      { ...booking('with-guest', '2030-07-14', '2030-07-16'), userId: 'user-1' },
      booking('without-guest', '2030-07-20', '2030-07-22'),
    ]);
    guestStore.findUsersByIds.mockResolvedValue([
      { id: 'user-1', phoneE164: '+12025550100', createdAt: new Date(0), updatedAt: new Date(0) },
    ]);

    const result = await guestDataExport.getAllBookings();

    expect(result.map((entry) => [entry.booking.id, entry.user?.phone])).toEqual([
      ['with-guest', '+12025550100'],
      ['without-guest', undefined],
    ]);
    expect(guestStore.findUsersByIds).toHaveBeenCalledExactlyOnceWith(['user-1']);
    expect(guestStore.findBookingById).not.toHaveBeenCalled();
    expect(guestStore.findUserById).not.toHaveBeenCalled();
    expect(Object.keys(result[0].user ?? {}).sort()).toEqual(['createdAt', 'id', 'phone', 'updatedAt']);
  });

  it('queries guest bookings by userId directly without scanning all bookings', async () => {
    const guest = { id: 'user-1', phoneE164: '+12025550100', createdAt: new Date(0), updatedAt: new Date(0) };
    guestStore.findUserByPhone.mockResolvedValue(guest);
    guestStore.findBookingsByUserId.mockResolvedValue([{ ...booking('with-guest', '2030-07-14', '2030-07-16'), userId: 'user-1' }]);

    const result = await guestDataExport.getBookingsByPhone('+12025550100');

    expect(result).toHaveLength(1);
    expect(result[0].user?.phone).toBe('+12025550100');
    expect(guestStore.findBookingsByUserId).toHaveBeenCalledExactlyOnceWith('user-1');
    expect(guestStore.getAllBookings).not.toHaveBeenCalled();
  });

  it('delegates statistics to aggregate count queries', async () => {
    await expect(guestDataExport.getStatistics()).resolves.toEqual({
      totalBookings: 4,
      totalUsers: 1,
      totalClaimedBookings: 1,
    });
    expect(guestStore.getStatistics).toHaveBeenCalledOnce();
    expect(guestStore.getAllBookings).not.toHaveBeenCalled();
  });

  it('exports a booking looked up by reference without querying it again by id', async () => {
    const guest = { id: 'user-1', phoneE164: '+12025550100', createdAt: new Date(0), updatedAt: new Date(0) };
    guestStore.findBookingByReference.mockResolvedValue({ ...booking('ref-1', '2030-07-14', '2030-07-16'), userId: 'user-1', externalReference: 'REF-1' });
    guestStore.findUserById.mockResolvedValue(guest);

    const exported = await guestDataExport.getBookingByReference('REF-1');

    expect(exported?.booking.id).toBe('ref-1');
    expect(exported?.user?.phone).toBe('+12025550100');
    expect(guestStore.findBookingByReference).toHaveBeenCalledExactlyOnceWith('REF-1');
    expect(guestStore.findUserById).toHaveBeenCalledExactlyOnceWith('user-1');
    expect(guestStore.findBookingById).not.toHaveBeenCalled();
  });
});
