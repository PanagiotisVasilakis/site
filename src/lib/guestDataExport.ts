/**
 * Admin read model: bookings joined with their guest user.
 */

import { guestStore } from '@/lib/guestDataStore';
import type { Booking, User } from '@/lib/guestDataStore';
import { logger } from '@/lib/logger-enterprise';

interface BookingExport {
  booking: {
    id: string;
    source: string;
    startDate: string;
    endDate: string;
    provider: string;
    externalReference?: string;
    accessStatus: 'PENDING' | 'VERIFIED';
    claimedAt?: Date;
    createdAt: Date;
  };
  user?: {
    id: string;
    phone: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

function toBookingExport(booking: Booking, user?: User): BookingExport {
  return {
    booking: {
      id: booking.id,
      source: booking.source,
      startDate: booking.startDate.toISOString(),
      endDate: booking.endDate.toISOString(),
      provider: booking.provider,
      externalReference: booking.externalReference ?? undefined,
      accessStatus: booking.accessStatus,
      claimedAt: booking.claimedAt ?? undefined,
      createdAt: booking.createdAt,
    },
    user: user ? {
      id: user.id,
      phone: user.phoneE164,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    } : undefined,
  };
}

class GuestDataExport {
  async getAllBookings(): Promise<BookingExport[]> {
    return this.withDetails(await guestStore.getAllBookings());
  }

  async getBookingByReference(reference: string): Promise<BookingExport | null> {
    const booking = await guestStore.findBookingByReference(reference);
    if (!booking) {
      logger.info('Booking not found', { referenceLength: reference.length });
      return null;
    }
    const user = booking.userId ? await guestStore.findUserById(booking.userId) : undefined;
    return toBookingExport(booking, user);
  }

  async getBookingsByPhone(phone: string): Promise<BookingExport[]> {
    const user = await guestStore.findUserByPhone(phone);
    if (!user) {
      logger.info('User not found by phone', { phone: phone.substring(0, 3) + '***' });
      return [];
    }
    const bookings = await guestStore.findBookingsByUserId(user.id);
    return bookings.map((booking) => toBookingExport(booking, user));
  }

  async getBookingDetails(bookingId: string): Promise<BookingExport | null> {
    const booking = await guestStore.findBookingById(bookingId);
    if (!booking) return null;

    const user = booking.userId ? await guestStore.findUserById(booking.userId) : undefined;
    return toBookingExport(booking, user);
  }

  async searchBookingsByDateRange(startDate: string): Promise<BookingExport[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(startDate)) return [];
    const targetDate = new Date(`${startDate}T00:00:00Z`);
    if (Number.isNaN(targetDate.getTime())) return [];
    return this.withDetails(await guestStore.findBookingsOnDate(targetDate));
  }

  async getStatistics(): Promise<{
    totalBookings: number;
    totalUsers: number;
    totalClaimedBookings: number;
  }> {
    return guestStore.getStatistics();
  }

  // Joins only the referenced users in one filtered query instead of per booking.
  private async withDetails(bookings: Booking[]): Promise<BookingExport[]> {
    if (bookings.length === 0) return [];
    const userIds = [...new Set(
      bookings
        .map((booking) => booking.userId)
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
    )];
    const users = await guestStore.findUsersByIds(userIds);
    const usersById = new Map(users.map((user) => [user.id, user]));
    return bookings.map((booking) => toBookingExport(
      booking,
      booking.userId ? usersById.get(booking.userId) : undefined,
    ));
  }
}

// Export singleton instance
export const guestDataExport = new GuestDataExport();
