/**
 * Admin read model: bookings joined with their guest user and check-in completion.
 */

import { guestStore } from '@/lib/guestDataStore';
import type { Booking, CheckinCompletionRec, User } from '@/lib/guestDataStore';
import { logger } from '@/lib/logger-enterprise';

interface BookingExport {
  booking: {
    id: string;
    reference?: string;
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
    email?: string;
    phone: string;
    countryOrigin: string;
    createdAt: Date;
    updatedAt: Date;
  };
  checkin?: {
    arrivalTime: string;
    specialRequests?: string;
    acceptedAt: Date;
  };
}

// Booking dates are UTC-midnight ISO datetimes; compare them as YYYY-MM-DD calendar dates.
const calendarDate = (isoDateTime: string): string => isoDateTime.slice(0, 10);

function toBookingExport(booking: Booking, user?: User, checkin?: CheckinCompletionRec): BookingExport {
  return {
    booking: {
      id: booking.id,
      reference: booking.reference,
      source: booking.source,
      startDate: booking.start_date,
      endDate: booking.end_date,
      provider: booking.provider,
      externalReference: booking.external_reference,
      accessStatus: booking.access_status,
      claimedAt: booking.claimed_at ? new Date(booking.claimed_at) : undefined,
      createdAt: new Date(booking.created_at),
    },
    user: user ? {
      id: user.id,
      email: user.email,
      phone: user.phone_e164,
      countryOrigin: user.country_origin,
      createdAt: new Date(user.created_at),
      updatedAt: new Date(user.updated_at),
    } : undefined,
    checkin: checkin ? {
      arrivalTime: checkin.arrival_time,
      specialRequests: checkin.special_requests,
      acceptedAt: new Date(checkin.accepted_at),
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
    return this.withDetails((await this.getAllBookingsRaw()).filter((b) => b.user_id === userId));
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

    const user = booking.user_id ? await guestStore.findUserById(booking.user_id) : undefined;
    const checkin = await guestStore.getCheckinCompletionByBooking(bookingId);
    return toBookingExport(booking, user, checkin);
  }

  /**
   * Search bookings by date range
   */
  async searchBookingsByDateRange(startDate: string, endDate?: string): Promise<BookingExport[]> {
    const bookings = (await this.getAllBookingsRaw()).filter((booking) => {
        const bookingStart = calendarDate(booking.start_date);
        const bookingEnd = calendarDate(booking.end_date);

        if (endDate) {
          return bookingStart >= startDate && bookingStart <= endDate;
        } else {
          return bookingStart === startDate || bookingEnd === startDate ||
                 (bookingStart <= startDate && bookingEnd >= startDate);
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
    totalCheckins: number;
    bookingsBySource: Record<string, number>;
    bookingsByStatus: Record<string, number>;
  }> {
    const [bookings, users, checkins] = await Promise.all([
        this.getAllBookingsRaw(),
        this.getAllUsersRaw(),
        this.getAllCheckinsRaw(),
      ]);

      const bookingsBySource: Record<string, number> = {};
      const bookingsByStatus: Record<string, number> = {};
      const checkedInBookingIds = new Set(checkins.map((checkin) => checkin.booking_id));

      bookings.forEach((booking) => {
        bookingsBySource[booking.source] = (bookingsBySource[booking.source] || 0) + 1;

        // Determine status based on dates and checkin
        const now = new Date().toISOString().split('T')[0];
        const hasCheckin = checkedInBookingIds.has(booking.id);

        const bookingStart = calendarDate(booking.start_date);
        const bookingEnd = calendarDate(booking.end_date);
        let status = 'upcoming';
        if (bookingEnd < now) {
          status = 'completed';
        } else if (bookingStart <= now && bookingEnd >= now) {
          status = hasCheckin ? 'checked_in' : 'active';
        }

        bookingsByStatus[status] = (bookingsByStatus[status] || 0) + 1;
      });

    return {
        totalBookings: bookings.length,
        totalUsers: users.length,
        totalClaimedBookings: bookings.filter((booking) => booking.access_status === 'VERIFIED').length,
        totalCheckins: checkins.length,
        bookingsBySource,
        bookingsByStatus,
    };
  }

  // Private helper methods

  // Joins users and check-ins from their (cached) full lists instead of querying per booking.
  private async withDetails(bookings: Booking[]): Promise<BookingExport[]> {
    if (bookings.length === 0) return [];
    const [users, checkins] = await Promise.all([this.getAllUsersRaw(), this.getAllCheckinsRaw()]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const checkinsByBookingId = new Map(checkins.map((checkin) => [checkin.booking_id, checkin]));
    return bookings.map((booking) => toBookingExport(
      booking,
      booking.user_id ? usersById.get(booking.user_id) : undefined,
      checkinsByBookingId.get(booking.id),
    ));
  }

  private async getAllBookingsRaw(): Promise<Booking[]> {
    return guestStore.getAllBookings();
  }

  private async getAllUsersRaw(): Promise<User[]> {
    return guestStore.getAllUsers();
  }

  private async getAllCheckinsRaw(): Promise<CheckinCompletionRec[]> {
    return guestStore.getAllCheckins();
  }

}

// Export singleton instance
export const guestDataExport = new GuestDataExport();
