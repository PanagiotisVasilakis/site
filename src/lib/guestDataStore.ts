import { checkinRepository, type CheckinRecord } from '@/lib/prisma-repositories/checkinRepository';
import { userRepository, type UserRecord } from '@/lib/prisma-repositories/userRepository';
import { bookingRepository, type BookingRecord } from '@/lib/prisma-repositories/bookingRepository';
import { refreshTokenRepository, type GuestRefreshTokenRec as PrismaGuestRefreshTokenRec } from '@/lib/prisma-repositories/refreshTokenRepository';
import { hashSensitive } from '@/lib/crypto';
import { logger } from '@/lib/logger-enterprise';
import { prisma } from '@/lib/prisma';
import { guestDataCache } from '@/lib/guestDataCache';
import { mapBookingFromDb } from '@/lib/mappers/domainMappers';
import crypto from 'node:crypto';
import { normalizePhone } from '@/lib/phone';

export type BookingSource = 'ONSITE' | 'EXTERNAL';
export type AccessStatus = 'PENDING' | 'VERIFIED';

export type User = UserRecord;
export type Booking = BookingRecord;

export type CheckinCompletionRec = CheckinRecord;
export type GuestRefreshTokenRec = PrismaGuestRefreshTokenRec;

export class BookingAlreadyLinkedError extends Error {
  readonly code = 'BOOKING_ALREADY_LINKED';

  constructor(
    readonly bookingId: string,
    readonly existingUserId: string,
    readonly attemptedUserId: string,
  ) {
    super('Booking is already linked to another user');
    this.name = 'BookingAlreadyLinkedError';
  }
}

export class BookingNotFoundError extends Error {
  readonly code = 'BOOKING_NOT_FOUND';

  constructor() {
    super('No matching booking was found');
    this.name = 'BookingNotFoundError';
  }
}

export const guestStore = {
  // Users
  async createUser(input: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    try {
      const normalized = normalizePhone(input.phone_e164, input.country_origin);
      if (!normalized) throw new Error('Invalid E.164 phone number');
      const user = await userRepository.create({ ...input, phone_e164: normalized.e164 });
      guestDataCache.invalidate(['users']);
      return user;
    } catch (error) {
      logger.error('guestStore: failed to create user', error);
      throw error;
    }
  },
  
  async findUserByPhone(phone: string): Promise<User | undefined> {
    const normalized = normalizePhone(phone);
    if (!normalized) return undefined;
    return userRepository.findByPhone(normalized.e164);
  },
  
  async findUserById(user_id: string): Promise<User | undefined> {
    return userRepository.findById(user_id);
  },
  
  async updateUserPassword(user_id: string, password_hash: string): Promise<User | undefined> {
    const user = await userRepository.updatePassword(user_id, password_hash);
    guestDataCache.invalidate(['users']);
    return user;
  },

  // Booking
  async linkOrCreateBooking(params: {
    source: BookingSource;
    reference?: string;
    provider?: string;
    external_reference?: string;
    start_date: string;
    end_date: string;
    user_id?: string;
    access_status?: AccessStatus;
  }): Promise<Booking> {
    try {
      // Check if booking already exists
      if (params.reference || params.external_reference) {
        const provider = params.provider ?? params.source.toLowerCase();
        const externalReference = params.external_reference ?? params.reference;
        const existing = externalReference
          ? await bookingRepository.findByProviderReference(provider, externalReference)
          : undefined;
        if (existing) {
          if (params.user_id && existing.user_id && existing.user_id !== params.user_id) {
            throw new BookingAlreadyLinkedError(existing.id, existing.user_id, params.user_id);
          }

          if (params.user_id && !existing.user_id) {
            const claimed = await prisma.booking.updateMany({
              where: { id: existing.id, userId: null },
              data: { userId: params.user_id, accessStatus: 'VERIFIED', claimedAt: new Date() },
            });
            const updated = await prisma.booking.findUnique({ where: { id: existing.id } });
            if (claimed.count !== 1 || !updated || updated.userId !== params.user_id) {
              throw new BookingAlreadyLinkedError(
                existing.id,
                updated?.userId ?? 'unknown',
                params.user_id,
              );
            }
            guestDataCache.invalidate(['bookings']);
            return mapBookingFromDb(updated);
          }

          return existing;
        }
      }
      
      const booking = await bookingRepository.create({
        source: params.source,
        reference: params.reference,
        start_date: params.start_date,
        end_date: params.end_date,
        user_id: params.user_id,
        provider: params.provider ?? params.source.toLowerCase(),
        external_reference: params.external_reference ?? params.reference,
        access_status: params.access_status ?? (params.user_id ? 'VERIFIED' : 'PENDING'),
        claimed_at: params.user_id ? Date.now() : undefined,
      });
      guestDataCache.invalidate(['bookings']);
      return booking;
    } catch (error) {
      logger.error('guestStore: failed to link or create booking', error);
      throw error;
    }
  },
  
  async findBookingByReference(reference: string): Promise<Booking | undefined> {
    return bookingRepository.findByReference(reference);
  },
  
  async findBookingById(id: string): Promise<Booking | undefined> {
    return bookingRepository.findById(id);
  },
  
  async findEligibleBookingForUser(user_id: string, nowDateISO: string = new Date().toISOString().slice(0,10)): Promise<Booking | undefined> {
    return bookingRepository.findEligibleForUser(user_id, nowDateISO);
  },

  // Check-in completion (development store only)
  async upsertCheckinCompletion(booking_id: string, data: { arrival_time: string; special_requests?: string }): Promise<CheckinCompletionRec> {
    try {
      const checkin = await checkinRepository.upsert(booking_id, data.arrival_time, data.special_requests);
      guestDataCache.invalidate(['checkins']);
      return checkin;
    } catch (error) {
      logger.error('guestStore: failed to upsert checkin completion', error);
      throw error;
    }
  },
  
  async getCheckinCompletionByBooking(booking_id: string): Promise<CheckinCompletionRec | undefined> {
    return checkinRepository.getByBookingId(booking_id);
  },

  // Refresh tokens
  async issueRefreshToken(user_id: string, ttlDays = 7, opts?: { family_id?: string; device_hint?: string; ip_hint?: string }): Promise<{ rec: GuestRefreshTokenRec; token: string }> {
    try {
      const rawSecret = crypto.randomBytes(32).toString('base64url');
      const { hash, salt } = hashSensitive(rawSecret);
      const family_id = opts?.family_id || crypto.randomUUID();
      
      const rec = await refreshTokenRepository.create(
        user_id,
        hash,
        salt,
        family_id,
        Date.now() + ttlDays * 24 * 60 * 60 * 1000,
        {
          deviceHint: opts?.device_hint,
          ipHint: opts?.ip_hint
        }
      );

      // New token format enables O(1) verification: <token-id>.<secret>
      const token = `${rec.id}.${rawSecret}`;
      
      return { rec, token };
    } catch (error) {
      logger.error('guestStore: failed to issue refresh token', error);
      throw error;
    }
  },
  
  async verifyRefreshToken(token: string): Promise<GuestRefreshTokenRec | undefined> {
    return refreshTokenRepository.verify(token);
  },
  
  async revokeRefreshToken(idOrToken: string): Promise<boolean> {
    // Try to revoke by ID first, then treat the value as a composite token.
    const byIdResult = await refreshTokenRepository.revoke(idOrToken);
    if (byIdResult) return true;
    const record = await refreshTokenRepository.verify(idOrToken);
    if (!record) return false;
    return refreshTokenRepository.revoke(record.id);
  },

  async revokeRefreshFamily(token: string): Promise<boolean> {
    return refreshTokenRepository.revokeFamilyForToken(token);
  },
  
  async rotateRefreshToken(oldToken: string, ttlDays = 7, context?: { device_hint?: string; ip_hint?: string }): Promise<{
    status: 'rotated' | 'invalid' | 'concurrent' | 'replayed';
    old?: GuestRefreshTokenRec;
    rec?: GuestRefreshTokenRec;
    token?: string;
  }> {
    try {
      const rawSecret = crypto.randomBytes(32).toString('base64url');
      const { hash, salt } = hashSensitive(rawSecret);
      const result = await refreshTokenRepository.rotate(oldToken, {
        tokenHash: hash,
        salt,
        expiresAt: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
        deviceHash: context?.device_hint,
        ipHash: context?.ip_hint,
      });

      if (result.status !== 'rotated') {
        return { status: result.status };
      }

      return {
        status: 'rotated',
        old: result.old,
        rec: result.rec,
        token: `${result.rec.id}.${rawSecret}`,
      };
    } catch (error) {
      logger.error('guestStore: failed to rotate refresh token', error);
      throw error;
    }
  },
  
  async purgeExpiredRefreshTokens(maxAgeDaysPastExpiry = 30): Promise<number> {
    return refreshTokenRepository.purgeExpired(maxAgeDaysPastExpiry);
  },
  
  // Admin helpers - get all data for export/analysis
  async getAllBookings(): Promise<Booking[]> {
    return guestDataCache.get('bookings', () => bookingRepository.getAll());
  },

  async getAllUsers(): Promise<User[]> {
    return guestDataCache.get('users', () => userRepository.getAll());
  },

  async getAllCheckins(): Promise<CheckinCompletionRec[]> {
    return guestDataCache.get('checkins', () => checkinRepository.getAll());
  },

};
