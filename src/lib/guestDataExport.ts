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
  /**
   * Get all bookings with full details
   */
  async getAllBookings(): Promise<BookingExport[]> {
    return this.withDetails(await this.getAllBookingsRaw());
  }

  /**
   * Get booking by reference number
   */
  async getBookingByReference(reference: string): Promise<BookingExport | null> {
    const booking = await guestStore.findBookingByReference(reference);
    if (!booking) {
      logger.info('Booking not found', { reference });
      return null;
    }
    return this.getBookingDetails(booking.id);
  }

  /**
   * Get all bookings for a specific user
   */
  async getBookingsByUser(userId: string): Promise<BookingExport[]> {
    return this.withDetails((await this.getAllBookingsRaw()).filter((b) => b.userId === userId));
  }

  /**
   * Get booking by user phone number
   */
  async getBookingsByPhone(phone: string): Promise<BookingExport[]> {
    const user = await guestStore.findUserByPhone(phone);
    if (!user) {
      logger.info('User not found by phone', { phone: phone.substring(0, 3) + '***' });
      return [];
    }
    return this.getBookingsByUser(user.id);
  }

  /**
   * Get detailed booking information
   */
  async getBookingDetails(bookingId: string): Promise<BookingExport | null> {
    const booking = await guestStore.findBookingById(bookingId);
    if (!booking) return null;

    const user = booking.userId ? await guestStore.findUserById(booking.userId) : undefined;
    return toBookingExport(booking, user);
  }

  /**
   * Search bookings by date range
   */
  async searchBookingsByDateRange(startDate: string, endDate?: string): Promise<BookingExport[]> {
    const bookings = (await this.getAllBookingsRaw()).filter((booking) => {
        const bookingStart = calendarDate(booking.startDate);
        const bookingEnd = calendarDate(booking.endDate);

        if (endDate) {
          return bookingStart >= startDate && bookingStart <= endDate;
        } else {
          return bookingStart <= startDate && bookingEnd >= startDate;
        }
    });

    return this.withDetails(bookings);
  }

  /**
   * Get summary statistics
   */
  async getStatistics(): Promise<{
    totalBookings: number;
    totalUsers: number;
    totalClaimedBookings: number;
    bookingsBySource: Record<string, number>;
    bookingsByStatus: Record<string, number>;
  }> {
    const [bookings, users] = await Promise.all([
        this.getAllBookingsRaw(),
        this.getAllUsersRaw(),
      ]);

      const bookingsBySource: Record<string, number> = {};
      const bookingsByStatus: Record<string, number> = {};

      const now = new Date().toISOString().slice(0, 10);

      bookings.forEach((booking) => {
        bookingsBySource[booking.source] = (bookingsBySource[booking.source] || 0) + 1;

        // Determine status based on dates
        const bookingStart = calendarDate(booking.startDate);
        const bookingEnd = calendarDate(booking.endDate);
        let status = 'upcoming';
        if (bookingEnd < now) {
          status = 'completed';
        } else if (bookingStart <= now && bookingEnd >= now) {
          status = 'active';
        }

        bookingsByStatus[status] = (bookingsByStatus[status] || 0) + 1;
      });

    return {
        totalBookings: bookings.length,
        totalUsers: users.length,
        totalClaimedBookings: bookings.filter((booking) => booking.accessStatus === 'VERIFIED').length,
        bookingsBySource,
        bookingsByStatus,
    };
  }

  // Private helper methods

  // Joins users from one full-list query instead of querying per booking.
  private async withDetails(bookings: Booking[]): Promise<BookingExport[]> {
    if (bookings.length === 0) return [];
    const usersById = new Map((await this.getAllUsersRaw()).map((user) => [user.id, user]));
    return bookings.map((booking) => toBookingExport(
      booking,
      booking.userId ? usersById.get(booking.userId) : undefined,
    ));
  }

  private async getAllBookingsRaw(): Promise<Booking[]> {
    return guestStore.getAllBookings();
  }

  private async getAllUsersRaw(): Promise<User[]> {
    return guestStore.getAllUsers();
  }

}

// Export singleton instance
export const guestDataExport = new GuestDataExport();
