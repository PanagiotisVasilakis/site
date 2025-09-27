/**
 * Guest Data Export Tool
 * Tool to extract and display guest booking information from local storage
 */

import { guestStore } from '@/lib/guestDataStore';
import type { Booking, CheckinCompletionRec, Identity, User } from '@/lib/guestDataStore';
import { logger } from '@/lib/logger-enterprise';

interface BookingExport {
  booking: {
    id: string;
    reference?: string;
    source: string;
    startDate: string;
    endDate: string;
    createdAt: Date;
  };
  user: {
    id: string;
    email?: string;
    phone: string;
    countryOrigin: string;
    createdAt: Date;
    updatedAt: Date;
  };
  identities: Array<{
    type: string;
    last4Mask: string;
    verifiedAt?: Date;
  }>;
  access: Array<{
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  checkin?: {
    arrivalTime: string;
    specialRequests?: string;
    acceptedAt: Date;
  };
}

const isDefined = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

export class GuestDataExport {
  /**
   * Get all bookings with full details
   */
  getAllBookings(): BookingExport[] {
    try {
      const bookings = this.getAllBookingsRaw();
      return bookings
        .map((booking) => this.getBookingDetails(booking.id))
        .filter(isDefined);
    } catch (error) {
      logger.error('Failed to get all bookings', { error });
      return [];
    }
  }

  /**
   * Get booking by reference number
   */
  getBookingByReference(reference: string, lastName: string): BookingExport | null {
    try {
      const booking = guestStore.findBookingByReferenceAndLastName(reference, lastName);
      if (!booking) {
        logger.info('Booking not found', { reference, lastName: lastName.substring(0, 2) + '***' });
        return null;
      }

      return this.getBookingDetails(booking.id);
    } catch (error) {
      logger.error('Failed to get booking by reference', { error, reference });
      return null;
    }
  }

  /**
   * Get booking by booking ID
   */
  getBookingById(bookingId: string): BookingExport | null {
    try {
      const booking = guestStore.findBookingById(bookingId);
      if (!booking) {
        logger.info('Booking not found', { bookingId });
        return null;
      }

      return this.getBookingDetails(bookingId);
    } catch (error) {
      logger.error('Failed to get booking by ID', { error, bookingId });
      return null;
    }
  }

  /**
   * Get all bookings for a specific user
   */
  getBookingsByUser(userId: string): BookingExport[] {
    try {
      const bookings = this.getAllBookingsRaw().filter((b) => b.user_id === userId);
      return bookings
        .map((booking) => this.getBookingDetails(booking.id))
        .filter(isDefined);
    } catch (error) {
      logger.error('Failed to get bookings by user', { error, userId });
      return [];
    }
  }

  /**
   * Get booking by user phone number
   */
  getBookingsByPhone(phone: string): BookingExport[] {
    try {
      const user = guestStore.findUserByPhone(phone);
      if (!user) {
        logger.info('User not found by phone', { phone: phone.substring(0, 3) + '***' });
        return [];
      }

      return this.getBookingsByUser(user.id);
    } catch (error) {
      logger.error('Failed to get bookings by phone', { error });
      return [];
    }
  }

  /**
   * Get detailed booking information
   */
  getBookingDetails(bookingId: string): BookingExport | null {
    try {
      const booking = guestStore.findBookingById(bookingId);
      if (!booking) return null;

      const user = booking.user_id ? guestStore.findUserById(booking.user_id) : null;
      if (!user) return null;

      // Get identities
      const identities = this.getUserIdentities(user.id);

      // Get access records
      const access = guestStore.listAccessByUser(user.id)
        .filter(a => a.booking_id === bookingId)
        .map(a => ({
          status: a.status,
          createdAt: new Date(a.created_at),
          updatedAt: new Date(a.updated_at),
        }));

      // Get checkin completion
      const checkin = guestStore.getCheckinCompletionByBooking(bookingId);

      const result: BookingExport = {
        booking: {
          id: booking.id,
          reference: booking.reference,
          source: booking.source,
          startDate: booking.start_date,
          endDate: booking.end_date,
          createdAt: new Date(booking.created_at),
        },
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone_e164,
          countryOrigin: user.country_origin,
          createdAt: new Date(user.created_at),
          updatedAt: new Date(user.updated_at),
        },
        identities,
        access,
        checkin: checkin ? {
          arrivalTime: checkin.arrival_time,
          specialRequests: checkin.special_requests,
          acceptedAt: new Date(checkin.accepted_at),
        } : undefined,
      };

      return result;
    } catch (error) {
      logger.error('Failed to get booking details', { error, bookingId });
      return null;
    }
  }

  /**
   * Export booking data to JSON file
   */
  exportBookingToFile(bookingId: string, filePath?: string): string | null {
    try {
      const bookingData = this.getBookingDetails(bookingId);
      if (!bookingData) {
        logger.error('Booking not found for export', { bookingId });
        return null;
      }

      const jsonData = JSON.stringify(bookingData, null, 2);
      const fileName = filePath || `booking_${bookingData.booking.reference || bookingId}_${Date.now()}.json`;

      // In a Node.js environment, you could write to file:
      // fs.writeFileSync(fileName, jsonData, 'utf8');
      
      logger.info('Booking data exported', { 
        bookingId, 
        reference: bookingData.booking.reference,
        fileName 
      });

      return jsonData;
    } catch (error) {
      logger.error('Failed to export booking', { error, bookingId });
      return null;
    }
  }

  /**
   * Search bookings by date range
   */
  searchBookingsByDateRange(startDate: string, endDate?: string): BookingExport[] {
    try {
      const bookings = this.getAllBookingsRaw().filter((booking) => {
        const bookingStart = booking.start_date;
        const bookingEnd = booking.end_date;
        
        if (endDate) {
          return bookingStart >= startDate && bookingStart <= endDate;
        } else {
          return bookingStart === startDate || bookingEnd === startDate ||
                 (bookingStart <= startDate && bookingEnd >= startDate);
        }
      });

      return bookings
        .map((booking) => this.getBookingDetails(booking.id))
        .filter(isDefined);
    } catch (error) {
      logger.error('Failed to search bookings by date', { error, startDate, endDate });
      return [];
    }
  }

  /**
   * Get summary statistics
   */
  getStatistics(): {
    totalBookings: number;
    totalUsers: number;
    totalIdentities: number;
    totalCheckins: number;
    bookingsBySource: Record<string, number>;
    bookingsByStatus: Record<string, number>;
  } {
    try {
      const bookings = this.getAllBookingsRaw();
      const users = this.getAllUsersRaw();
      const identities = this.getAllIdentitiesRaw();
      const checkins = this.getAllCheckinsRaw();

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
        totalIdentities: identities.length,
        totalCheckins: checkins.length,
        bookingsBySource,
        bookingsByStatus,
      };
    } catch (error) {
      logger.error('Failed to get statistics', { error });
      return {
        totalBookings: 0,
        totalUsers: 0,
        totalIdentities: 0,
        totalCheckins: 0,
        bookingsBySource: {},
        bookingsByStatus: {},
      };
    }
  }

  // Private helper methods
  private getAllBookingsRaw(): Booking[] {
    try {
      return guestStore.getAllBookings() || [];
    } catch {
      return [];
    }
  }

  private getAllUsersRaw(): User[] {
    try {
      return guestStore.getAllUsers() || [];
    } catch {
      return [];
    }
  }

  private getAllIdentitiesRaw(): Identity[] {
    try {
      return guestStore.getAllIdentities() || [];
    } catch {
      return [];
    }
  }

  private getAllCheckinsRaw(): CheckinCompletionRec[] {
    try {
      return guestStore.getAllCheckins() || [];
    } catch {
      return [];
    }
  }

  private getUserIdentities(userId: string): BookingExport['identities'] {
    return this.getAllIdentitiesRaw()
      .filter((identity) => identity.user_id === userId)
      .map((identity) => ({
        type: identity.type,
        last4Mask: identity.last4_mask,
        verifiedAt: identity.verified_at ? new Date(identity.verified_at) : undefined,
      }));
  }
}

// Export singleton instance
export const guestDataExport = new GuestDataExport();