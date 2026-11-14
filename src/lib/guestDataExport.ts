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

// Booking dates are UTC-midnight instants (PostgreSQL DATE); compare them as YYYY-MM-DD calendar dates.
const calendarDate = (date: Date): string => date.toISOString().slice(0, 10);

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
    return this.getBookingDetails(booking.id);
  }

  async getBookingsByPhone(phone: string): Promise<BookingExport[]> {
    const user = await guestStore.findUserByPhone(phone);
    if (!user) {
      logger.info('User not found by phone', { phone: phone.substring(0, 3) + '***' });
      return [];
    }
    return this.withDetails((await guestStore.getAllBookings()).filter((b) => b.userId === user.id));
  }

  async getBookingDetails(bookingId: string): Promise<BookingExport | null> {
    const booking = await guestStore.findBookingById(bookingId);
    if (!booking) return null;

    const user = booking.userId ? await guestStore.findUserById(booking.userId) : undefined;
    return toBookingExport(booking, user);
  }

  async searchBookingsByDateRange(startDate: string): Promise<BookingExport[]> {
    const bookings = (await guestStore.getAllBookings()).filter((booking) => {
        const bookingStart = calendarDate(booking.startDate);
        const bookingEnd = calendarDate(booking.endDate);

        return bookingStart <= startDate && bookingEnd >= startDate;
    });

    return this.withDetails(bookings);
  }

  async getStatistics(): Promise<{
    totalBookings: number;
    totalUsers: number;
    totalClaimedBookings: number;
  }> {
    const [bookings, users] = await Promise.all([
        guestStore.getAllBookings(),
        guestStore.getAllUsers(),
      ]);

    return {
        totalBookings: bookings.length,
        totalUsers: users.length,
        totalClaimedBookings: bookings.filter((booking) => booking.accessStatus === 'VERIFIED').length,
    };
  }

  // Joins users from one full-list query instead of querying per booking.
  private async withDetails(bookings: Booking[]): Promise<BookingExport[]> {
    if (bookings.length === 0) return [];
    const usersById = new Map((await guestStore.getAllUsers()).map((user) => [user.id, user]));
    return bookings.map((booking) => toBookingExport(
      booking,
      booking.userId ? usersById.get(booking.userId) : undefined,
    ));
  }

}

// Export singleton instance
export const guestDataExport = new GuestDataExport();
