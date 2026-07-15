/**
 * Guest Data Export Tool
 * Tool to extract and display guest booking information from local storage
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

const isDefined = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

class GuestDataExport {
  /**
   * Get all bookings with full details
   */
  async getAllBookings(): Promise<BookingExport[]> {
    const bookings = await this.getAllBookingsRaw();
    const detailed = await Promise.all(
      bookings.map((booking) => this.getBookingDetails(booking.id))
    );
    return detailed.filter(isDefined);
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
   * Get booking by booking ID
   */
  async getBookingById(bookingId: string): Promise<BookingExport | null> {
    const booking = await guestStore.findBookingById(bookingId);
    if (!booking) {
      logger.info('Booking not found', { bookingId });
      return null;
    }
    return this.getBookingDetails(bookingId);
  }

  /**
   * Get all bookings for a specific user
   */
  async getBookingsByUser(userId: string): Promise<BookingExport[]> {
    const bookings = (await this.getAllBookingsRaw()).filter((b) => b.user_id === userId);
    const detailed = await Promise.all(
      bookings.map((booking) => this.getBookingDetails(booking.id))
    );
    return detailed.filter(isDefined);
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

    const user = booking.user_id ? await guestStore.findUserById(booking.user_id) : null;

    const checkin = await guestStore.getCheckinCompletionByBooking(bookingId);

    const result: BookingExport = {
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
    return result;
  }

  /**
   * Export booking data to JSON file
   */
  async exportBookingToFile(bookingId: string, filePath?: string): Promise<string | null> {
    const bookingData = await this.getBookingDetails(bookingId);
    if (!bookingData) {
      logger.info('Booking not found for export', { bookingId });
      return null;
    }

    const jsonData = JSON.stringify(bookingData, null, 2);
    const fileName = filePath || `booking_${bookingData.booking.reference || bookingId}_${Date.now()}.json`;

      // In a Node.js environment, you could write to file:
      // fs.writeFileSync(fileName, jsonData, 'utf8');
      
    logger.info('Booking data exported', {
      bookingId,
      reference: bookingData.booking.reference,
      fileName,
    });

    return jsonData;
  }

  /**
   * Search bookings by date range
   */
  async searchBookingsByDateRange(startDate: string, endDate?: string): Promise<BookingExport[]> {
    const bookings = (await this.getAllBookingsRaw()).filter((booking) => {
        const bookingStart = booking.start_date;
        const bookingEnd = booking.end_date;
        
        if (endDate) {
          return bookingStart >= startDate && bookingStart <= endDate;
        } else {
          return bookingStart === startDate || bookingEnd === startDate ||
                 (bookingStart <= startDate && bookingEnd >= startDate);
        }
    });

    const detailed = await Promise.all(
      bookings.map((booking) => this.getBookingDetails(booking.id))
    );

    return detailed.filter(isDefined);
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

      bookings.forEach((booking) => {
        bookingsBySource[booking.source] = (bookingsBySource[booking.source] || 0) + 1;
        
        // Determine status based on dates and checkin
        const now = new Date().toISOString().split('T')[0];
        const hasCheckin = checkins.some((checkin) => checkin.booking_id === booking.id);
        
        let status = 'upcoming';
        if (booking.end_date < now) {
          status = 'completed';
        } else if (booking.start_date <= now && booking.end_date >= now) {
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
