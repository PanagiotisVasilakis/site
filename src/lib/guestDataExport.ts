/**
 * Admin read model: bookings joined with their guest user, and the complete
 * per-guest export for access and portability requests.
 */

import type { Prisma } from '@/generated/prisma/client';
import { guestStore } from '@/lib/guestDataStore';
import type { Booking, User } from '@/lib/guestDataStore';
import { logger } from '@/lib/logger-enterprise';
import { prisma } from '@/lib/prisma';

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

// The complete per-guest export names its columns, never `include`: a column added to the schema
// later stays out of the file until someone decides that it belongs in it. No list selects a
// secret (password hash, claim-token digest, refresh-token hash) or a hashed network identifier
// (IP, device); tests/unit/guest-data-export.test.ts walks the lists and the result for such
// names, and checks every model that points at a user or a booking against the lists below.
// Left out on purpose: BookingClaimGrant (token digests), RefreshTokenFamily and RefreshToken
// (token hashes, device and IP hashes), OutboxEvent (delivery bookkeeping without guest content)
// and SecurityAuditEvent (the host's security log: keyed address hashes and, for the portal events,
// a booking id).
const exportUserSelect = {
  id: true,
  phoneE164: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

const exportBookingSelect = {
  id: true,
  source: true,
  startDate: true,
  endDate: true,
  userId: true,
  provider: true,
  externalReference: true,
  accessStatus: true,
  claimedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.BookingSelect;

const exportCheckInRequestSelect = {
  id: true,
  bookingId: true,
  userId: true,
  guestName: true,
  guestEmail: true,
  guestPhone: true,
  requestedTime: true,
  message: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.CheckInRequestSelect;

// The hash of the accepted terms text stays out: the version names the text.
const exportTermsAcceptanceSelect = {
  bookingId: true,
  termsVersion: true,
  acceptedAt: true,
} as const satisfies Prisma.TermsAcceptanceSelect;

// The subject digest stays out: it is derived from the account id.
const exportPrivacyRequestSelect = {
  id: true,
  bookingId: true,
  requestType: true,
  status: true,
  requestedAt: true,
  completedAt: true,
  auditNote: true,
} as const satisfies Prisma.PrivacyRequestSelect;

// Sign-in history without the session id, which is also the first half of the refresh token.
const exportSessionSelect = {
  bookingId: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
} as const satisfies Prisma.SessionSelect;

type ExportBookingRow = Prisma.BookingGetPayload<{ select: typeof exportBookingSelect }>;
type ExportCheckInRequestRow = Prisma.CheckInRequestGetPayload<{ select: typeof exportCheckInRequestSelect }>;
type ExportTermsAcceptanceRow = Prisma.TermsAcceptanceGetPayload<{ select: typeof exportTermsAcceptanceSelect }>;
type ExportPrivacyRequestRow = Prisma.PrivacyRequestGetPayload<{ select: typeof exportPrivacyRequestSelect }>;
type ExportSessionRow = Prisma.SessionGetPayload<{ select: typeof exportSessionSelect }>;

// Instants are ISO strings and empty columns are null, so the file shows which columns exist.
interface ExportedBooking {
  id: string;
  source: string;
  startDate: string;
  endDate: string;
  provider: string;
  externalReference: string | null;
  accessStatus: string;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExportedCheckInRequest {
  id: string;
  bookingId: string | null;
  userId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  requestedTime: string;
  message: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ExportedTermsAcceptance {
  bookingId: string;
  termsVersion: string;
  acceptedAt: string;
}

interface ExportedPrivacyRequest {
  id: string;
  bookingId: string | null;
  requestType: string;
  status: string;
  requestedAt: string;
  completedAt: string | null;
  auditNote: string | null;
}

interface ExportedPortalSession {
  bookingId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface GuestDataExportBundle {
  exportedAt: string;
  /** The booking the export was requested for; this and `user` keep the shape of the former single-booking export. */
  booking: ExportedBooking;
  /** The guest account, or null while nobody has claimed the booking. */
  user: { id: string; phone: string; createdAt: string; updatedAt: string } | null;
  bookings: ExportedBooking[];
  checkInRequests: ExportedCheckInRequest[];
  termsAcceptances: ExportedTermsAcceptance[];
  privacyRequests: ExportedPrivacyRequest[];
  portalSessions: ExportedPortalSession[];
}

const isoOrNull = (date: Date | null): string | null => date?.toISOString() ?? null;

function toExportedBooking(row: ExportBookingRow): ExportedBooking {
  return {
    id: row.id,
    source: row.source,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    provider: row.provider,
    externalReference: row.externalReference,
    accessStatus: row.accessStatus,
    claimedAt: isoOrNull(row.claimedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toExportedCheckInRequest(row: ExportCheckInRequestRow): ExportedCheckInRequest {
  return {
    id: row.id,
    bookingId: row.bookingId,
    userId: row.userId,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    guestPhone: row.guestPhone,
    requestedTime: row.requestedTime,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toExportedTermsAcceptance(row: ExportTermsAcceptanceRow): ExportedTermsAcceptance {
  return { bookingId: row.bookingId, termsVersion: row.termsVersion, acceptedAt: row.acceptedAt.toISOString() };
}

function toExportedPrivacyRequest(row: ExportPrivacyRequestRow): ExportedPrivacyRequest {
  return {
    id: row.id,
    bookingId: row.bookingId,
    requestType: row.requestType,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: isoOrNull(row.completedAt),
    auditNote: row.auditNote,
  };
}

function toExportedPortalSession(row: ExportSessionRow): ExportedPortalSession {
  return {
    bookingId: row.bookingId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: isoOrNull(row.revokedAt),
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
      logger.info('Booking not found', { referenceLength: reference.length });
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
   * Everything stored about the guest of one booking, for an access or portability request: the
   * account, every booking of the account, every arrival request, the accepted terms, the privacy
   * requests and the portal sign-in history. A booking nobody has claimed yields that booking and
   * the arrival requests attached to it. One snapshot, so a claim or an erasure that runs
   * meanwhile cannot leave a half-erased file.
   */
  async getCompleteGuestExport(bookingId: string): Promise<GuestDataExportBundle | null> {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: exportBookingSelect });
      if (!booking) return null;

      const user = booking.userId
        ? await tx.user.findUnique({ where: { id: booking.userId }, select: exportUserSelect })
        : null;
      const bookings = user
        ? await tx.booking.findMany({
          where: { userId: user.id },
          orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
          select: exportBookingSelect,
        })
        : [booking];
      // The reach of the erasure in privacyService.ts (the account's own requests and every
      // request on its bookings), so the file shows what an erasure would clear.
      const checkInRequests = await tx.checkInRequest.findMany({
        where: {
          OR: [
            ...(user ? [{ userId: user.id }] : []),
            { bookingId: { in: bookings.map((entry) => entry.id) } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: exportCheckInRequestSelect,
      });
      // Terms, privacy requests and sign-ins exist only for an account.
      const termsAcceptances = user
        ? await tx.termsAcceptance.findMany({
          where: { userId: user.id },
          orderBy: { acceptedAt: 'asc' },
          select: exportTermsAcceptanceSelect,
        })
        : [];
      const privacyRequests = user
        ? await tx.privacyRequest.findMany({
          where: { userId: user.id },
          orderBy: { requestedAt: 'asc' },
          select: exportPrivacyRequestSelect,
        })
        : [];
      const sessions = user
        ? await tx.session.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'asc' },
          select: exportSessionSelect,
        })
        : [];

      return {
        exportedAt: new Date().toISOString(),
        booking: toExportedBooking(booking),
        user: user
          ? {
            id: user.id,
            phone: user.phoneE164,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          }
          : null,
        bookings: bookings.map(toExportedBooking),
        checkInRequests: checkInRequests.map(toExportedCheckInRequest),
        termsAcceptances: termsAcceptances.map(toExportedTermsAcceptance),
        privacyRequests: privacyRequests.map(toExportedPrivacyRequest),
        portalSessions: sessions.map(toExportedPortalSession),
      };
    }, { isolationLevel: 'RepeatableRead' });
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
  }> {
    const [bookings, users] = await Promise.all([
        this.getAllBookingsRaw(),
        this.getAllUsersRaw(),
      ]);

    return {
        totalBookings: bookings.length,
        totalUsers: users.length,
        totalClaimedBookings: bookings.filter((booking) => booking.accessStatus === 'VERIFIED').length,
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
