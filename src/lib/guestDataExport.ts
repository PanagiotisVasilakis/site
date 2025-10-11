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
  async getAllBookings(): Promise<BookingExport[]> {
    try {
      const bookings = await this.getAllBookingsRaw();
      const detailed = await Promise.all(
        bookings.map((booking) => this.getBookingDetails(booking.id))
      );
      return detailed.filter(isDefined);
    } catch (error) {
      logger.error('Failed to get all bookings', { error });
      return [];
    }
  }

  /**
   * Get booking by reference number
   */
  async getBookingByReference(reference: string, lastName: string): Promise<BookingExport | null> {
    try {
      const booking = await guestStore.findBookingByReferenceAndLastName(reference, lastName);
      if (!booking) {
        logger.info('Booking not found', { reference, lastName: lastName.substring(0, 2) + '***' });
        return null;
      }

      return await this.getBookingDetails(booking.id);
    } catch (error) {
      logger.error('Failed to get booking by reference', { error, reference });
      return null;
    }
  }

  /**
   * Get booking by booking ID
   */
  async getBookingById(bookingId: string): Promise<BookingExport | null> {
    try {
      const booking = await guestStore.findBookingById(bookingId);
      if (!booking) {
        logger.info('Booking not found', { bookingId });
        return null;
      }

      return await this.getBookingDetails(bookingId);
    } catch (error) {
      logger.error('Failed to get booking by ID', { error, bookingId });
      return null;
    }
  }

  /**
   * Get all bookings for a specific user
   */
  async getBookingsByUser(userId: string): Promise<BookingExport[]> {
    try {
      const bookings = (await this.getAllBookingsRaw()).filter((b) => b.user_id === userId);
      const detailed = await Promise.all(
        bookings.map((booking) => this.getBookingDetails(booking.id))
      );
      return detailed.filter(isDefined);
    } catch (error) {
      logger.error('Failed to get bookings by user', { error, userId });
      return [];
    }
  }

  /**
   * Get booking by user phone number
   */
  async getBookingsByPhone(phone: string): Promise<BookingExport[]> {
    try {
      const user = await guestStore.findUserByPhone(phone);
      if (!user) {
        logger.info('User not found by phone', { phone: phone.substring(0, 3) + '***' });
        return [];
      }

      return await this.getBookingsByUser(user.id);
    } catch (error) {
      logger.error('Failed to get bookings by phone', { error });
      return [];
    }
  }

  /**
   * Get detailed booking information
   */
  async getBookingDetails(bookingId: string): Promise<BookingExport | null> {
    try {
      const booking = await guestStore.findBookingById(bookingId);
      if (!booking) return null;

      const user = booking.user_id ? await guestStore.findUserById(booking.user_id) : null;
      if (!user) return null;

      // Get identities
      const identities = await this.getUserIdentities(user.id);

      // Get access records
      const accessRecords = await guestStore.listAccessByUser(user.id);
      const access = accessRecords
        .filter((record) => record.booking_id === bookingId)
        .map((record) => ({
          status: record.status,
          createdAt: new Date(record.created_at),
          updatedAt: new Date(record.updated_at),
        }));

      // Get checkin completion
      const checkin = await guestStore.getCheckinCompletionByBooking(bookingId);

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
  async exportBookingToFile(bookingId: string, filePath?: string): Promise<string | null> {
    try {
      const bookingData = await this.getBookingDetails(bookingId);
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
  async searchBookingsByDateRange(startDate: string, endDate?: string): Promise<BookingExport[]> {
    try {
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
    } catch (error) {
      logger.error('Failed to search bookings by date', { error, startDate, endDate });
      return [];
    }
  }

  /**
   * Get summary statistics
   */
  async getStatistics(): Promise<{
    totalBookings: number;
    totalUsers: number;
    totalIdentities: number;
    totalCheckins: number;
    bookingsBySource: Record<string, number>;
    bookingsByStatus: Record<string, number>;
  }> {
    try {
      const [bookings, users, identities, checkins] = await Promise.all([
        this.getAllBookingsRaw(),
        this.getAllUsersRaw(),
        this.getAllIdentitiesRaw(),
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
  private async getAllBookingsRaw(): Promise<Booking[]> {
    try {
      return await guestStore.getAllBookings();
    } catch {
      return [];
    }
  }

  private async getAllUsersRaw(): Promise<User[]> {
    try {
      return await guestStore.getAllUsers();
    } catch {
      return [];
    }
  }

  private async getAllIdentitiesRaw(): Promise<Identity[]> {
    try {
      return await guestStore.getAllIdentities();
    } catch {
      return [];
    }
  }

  private async getAllCheckinsRaw(): Promise<CheckinCompletionRec[]> {
    try {
      return await guestStore.getAllCheckins();
    } catch {
      return [];
    }
  }

  private async getUserIdentities(userId: string): Promise<BookingExport['identities']> {
    const identities = await this.getAllIdentitiesRaw();
    return identities
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