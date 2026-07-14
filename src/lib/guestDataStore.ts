import { accessRepository, type AccessRecord } from '@/lib/prisma-repositories/accessRepository';
import { checkinRepository, type CheckinRecord } from '@/lib/prisma-repositories/checkinRepository';
import { userRepository, type UserRecord } from '@/lib/prisma-repositories/userRepository';
import { identityRepository, type IdentityRecord } from '@/lib/prisma-repositories/identityRepository';
import { bookingRepository, type BookingRecord } from '@/lib/prisma-repositories/bookingRepository';
import { refreshTokenRepository, type GuestRefreshTokenRec as PrismaGuestRefreshTokenRec } from '@/lib/prisma-repositories/refreshTokenRepository';
import { hashSensitive, maskLast4 } from '@/lib/crypto';
import { buildBookingLastNameTokenSearchValues, createBookingLastNameTokens } from '@/lib/bookingLastNameTokens';
import { logger } from '@/lib/logger-enterprise';
import { prisma } from '@/lib/prisma';
import { guestDataCache } from '@/lib/guestDataCache';
import { mapAccessFromDb, mapBookingFromDb, mapUserFromDb } from '@/lib/mappers/domainMappers';
import type { Booking as PrismaBooking, Prisma } from '@/generated/prisma/client';
import crypto from 'node:crypto';
import { normalizePhone } from '@/lib/phone';

export type IdentityType = 'AFM' | 'PASSPORT';
export type BookingSource = 'ONSITE' | 'EXTERNAL';
export type AccessStatus = 'PENDING' | 'VERIFIED';

export type User = UserRecord;
export type Identity = IdentityRecord;
export type Booking = BookingRecord;
export type BookingAccess = AccessRecord;

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

export class OnsiteGrantRejectedError extends Error {
  readonly code = 'ONSITE_GRANT_REJECTED';

  constructor() {
    super('Onsite grant is invalid, expired, or already consumed');
    this.name = 'OnsiteGrantRejectedError';
  }
}

function bookingLookupClauses(lastName: string): Array<{ lastNameToken?: string; lastNameTokenNoWs?: string }> {
  const tokenCandidates = buildBookingLastNameTokenSearchValues(lastName);
  return tokenCandidates.flatMap((token) => [
    { lastNameToken: token },
    { lastNameTokenNoWs: token },
  ]);
}

async function claimBookingForUser(
  tx: Prisma.TransactionClient,
  bookingDb: PrismaBooking,
  userId: string,
): Promise<PrismaBooking> {
  if (bookingDb.userId === userId) {
    return bookingDb;
  }

  if (bookingDb.userId) {
    throw new BookingAlreadyLinkedError(bookingDb.id, bookingDb.userId, userId);
  }

  const claimed = await tx.booking.updateMany({
    where: { id: bookingDb.id, userId: null },
    data: { userId },
  });

  if (claimed.count === 1) {
    const updated = await tx.booking.findUnique({ where: { id: bookingDb.id } });
    if (updated) return updated;
  }

  const current = await tx.booking.findUnique({ where: { id: bookingDb.id } });
  if (current?.userId === userId) return current;
  throw new BookingAlreadyLinkedError(bookingDb.id, current?.userId ?? 'unknown', userId);
}

async function findAndClaimExistingBooking(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    bookingId?: string;
    reference?: string;
    lastName?: string;
  },
): Promise<PrismaBooking> {
  let bookingDb: PrismaBooking | null = null;

  if (params.bookingId) {
    bookingDb = await tx.booking.findUnique({
      where: { id: params.bookingId },
    });
  }

  if (!bookingDb && params.reference && params.lastName) {
    bookingDb = await tx.booking.findFirst({
      where: {
        reference: params.reference,
        OR: bookingLookupClauses(params.lastName),
      },
    });
  }

  if (bookingDb) {
    return claimBookingForUser(tx, bookingDb, params.userId);
  }

  throw new BookingNotFoundError();
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
    try {
      const normalized = normalizePhone(phone);
      if (!normalized) return undefined;
      return await userRepository.findByPhone(normalized.e164);
    } catch (error) {
      logger.error('guestStore: failed to find user by phone', error);
      return undefined;
    }
  },
  
  async findUserById(user_id: string): Promise<User | undefined> {
    try {
      return await userRepository.findById(user_id);
    } catch (error) {
      logger.error('guestStore: failed to find user by ID', error);
      return undefined;
    }
  },
  
  async updateUserPassword(user_id: string, password_hash: string): Promise<User | undefined> {
    try {
      const user = await userRepository.updatePassword(user_id, password_hash);
      guestDataCache.invalidate(['users']);
      return user;
    } catch (error) {
      logger.error('guestStore: failed to update user password', error);
      return undefined;
    }
  },

  // Identity
  async upsertIdentity(user_id: string, type: IdentityType, rawValue: string): Promise<Identity> {
    try {
      const { hash, salt } = hashSensitive(rawValue);
      const last4 = maskLast4(rawValue);
      const identity = await identityRepository.upsert(user_id, type, hash, salt, last4);
      guestDataCache.invalidate(['identities']);
      return identity;
    } catch (error) {
      logger.error('guestStore: failed to upsert identity', error);
      throw error;
    }
  },

  // Booking
  async linkOrCreateBooking(params: Omit<Booking, 'id' | 'created_at' | 'last_name_hash' | 'last_name_salt' | 'last_name_token' | 'last_name_token_nows'> & { last_name?: string }): Promise<Booking> {
    try {
      // Check if booking already exists
      if (params.reference) {
        const tokenCandidates = params.last_name
          ? buildBookingLastNameTokenSearchValues(params.last_name)
          : [];
        const existing = await bookingRepository.findByReferenceAndLastName(
          params.reference,
          tokenCandidates
        );
        if (existing) {
          if (params.user_id && existing.user_id && existing.user_id !== params.user_id) {
            throw new BookingAlreadyLinkedError(existing.id, existing.user_id, params.user_id);
          }

          if (params.user_id && !existing.user_id) {
            const claimed = await prisma.booking.updateMany({
              where: { id: existing.id, userId: null },
              data: { userId: params.user_id },
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
      
      let last_name_hash: string | undefined;
      let last_name_salt: string | undefined;
      
      if (params.last_name) {
        const r = hashSensitive(params.last_name);
        last_name_hash = r.hash;
        last_name_salt = r.salt;
      }
      
      const lookupTokens = params.last_name ? createBookingLastNameTokens(params.last_name) : undefined;
      
      const booking = await bookingRepository.create({
        source: params.source,
        reference: params.reference,
        start_date: params.start_date,
        end_date: params.end_date,
        user_id: params.user_id,
        last_name_hash,
        last_name_salt,
        last_name_token: lookupTokens?.lastNameToken,
        last_name_token_nows: lookupTokens?.lastNameTokenNoWs
      });
      guestDataCache.invalidate(['bookings']);
      return booking;
    } catch (error) {
      logger.error('guestStore: failed to link or create booking', error);
      throw error;
    }
  },
  
  async findBookingByReferenceAndLastName(reference: string, lastName: string): Promise<Booking | undefined> {
    try {
      const tokenCandidates = buildBookingLastNameTokenSearchValues(lastName);
      
      // Accept matches where either stored token equals either input token variant
      return await bookingRepository.findByReferenceAndLastName(
        reference,
        tokenCandidates
      );
    } catch (error) {
      logger.error('guestStore: failed to find booking by reference and last name', error);
      return undefined;
    }
  },
  
  async findBookingById(id: string): Promise<Booking | undefined> {
    try {
      return await bookingRepository.findById(id);
    } catch (error) {
      logger.error('guestStore: failed to find booking by ID', error);
      return undefined;
    }
  },
  
  async findEligibleBookingForUser(user_id: string, nowDateISO: string = new Date().toISOString().slice(0,10)): Promise<Booking | undefined> {
    try {
      return await bookingRepository.findEligibleForUser(user_id, nowDateISO);
    } catch (error) {
      logger.error('guestStore: failed to find eligible booking for user', error);
      return undefined;
    }
  },

  // Access
  async setAccess(user_id: string, booking_id: string, status: AccessStatus): Promise<BookingAccess> {
    try {
      const access = await accessRepository.set(user_id, booking_id, status);
      guestDataCache.invalidate(['access']);
      return access;
    } catch (error) {
      logger.error('guestStore: failed to set access', error);
      throw error;
    }
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
    try {
      return await checkinRepository.getByBookingId(booking_id);
    } catch (error) {
      logger.error('guestStore: failed to get checkin completion by booking', error);
      return undefined;
    }
  },

  // Refresh tokens
  async issueRefreshToken(user_id: string, ttlDays = 60, opts?: { family_id?: string; device_hint?: string; ip_hint?: string }): Promise<{ rec: GuestRefreshTokenRec; token: string }> {
    try {
      const rawSecret = crypto.randomBytes(32).toString('base64url');
      const { hash, salt } = hashSensitive(rawSecret);
      const family_id = opts?.family_id || `rtfam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      
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
    try {
      return await refreshTokenRepository.verify(token);
    } catch (error) {
      logger.error('guestStore: failed to verify refresh token', error);
      return undefined;
    }
  },
  
  async revokeRefreshToken(idOrToken: string): Promise<boolean> {
    try {
      // Try to revoke by ID first
      const byIdResult = await refreshTokenRepository.revoke(idOrToken);
      if (byIdResult) return true;
      
      // If that fails, try verifying the token to locate the record
      const record = await refreshTokenRepository.verify(idOrToken);
      if (!record) return false;

      return await refreshTokenRepository.revoke(record.id);
    } catch (error) {
      logger.error('guestStore: failed to revoke refresh token', error);
      return false;
    }
  },
  
  async rotateRefreshToken(oldToken: string, ttlDays = 60): Promise<{
    status: 'rotated' | 'invalid' | 'replayed';
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
      return { status: 'invalid' };
    }
  },
  
  async purgeExpiredRefreshTokens(maxAgeDaysPastExpiry = 30): Promise<number> {
    try {
      return await refreshTokenRepository.purgeExpired(maxAgeDaysPastExpiry);
    } catch (error) {
      logger.error('guestStore: failed to purge expired refresh tokens', error);
      return 0;
    }
  },
  
  // DSAR helpers (read-only)
  async listAccessByUser(user_id: string): Promise<BookingAccess[]> {
    try {
      return await accessRepository.listByUser(user_id);
    } catch (error) {
      logger.error('guestStore: failed to list access by user', error);
      return [];
    }
  },

  // Admin helpers - get all data for export/analysis
  async getAllBookings(): Promise<Booking[]> {
    try {
      return await guestDataCache.get('bookings', () => bookingRepository.getAll());
    } catch (error) {
      logger.error('guestStore: failed to get all bookings', error);
      return [];
    }
  },

  async getAllUsers(): Promise<User[]> {
    try {
      return await guestDataCache.get('users', () => userRepository.getAll());
    } catch (error) {
      logger.error('guestStore: failed to get all users', error);
      return [];
    }
  },

  async getAllIdentities(): Promise<Identity[]> {
    try {
      return await guestDataCache.get('identities', () => identityRepository.getAll());
    } catch (error) {
      logger.error('guestStore: failed to get all identities', error);
      return [];
    }
  },

  async getAllCheckins(): Promise<CheckinCompletionRec[]> {
    try {
      return await guestDataCache.get('checkins', () => checkinRepository.getAll());
    } catch (error) {
      logger.error('guestStore: failed to get all checkins', error);
      return [];
    }
  },

  async getAllAccess(): Promise<BookingAccess[]> {
    try {
      return await guestDataCache.get('access', () => accessRepository.getAll());
    } catch (error) {
      logger.error('guestStore: failed to get all access records', error);
      return [];
    }
  },

  // ============================================================================
  // TRANSACTION METHODS - Atomic multi-step operations
  // ============================================================================

  /**
   * Links a user to a booking with identity verification and access grant.
   * All operations are atomic - if any fails, all are rolled back.
   * 
   * Used by: portal/verify/route.ts after user authentication
   * 
   * @param params - User linkage parameters
   * @returns Booking and access records (snake_case)
   */
  async linkUserToBookingWithAccess(params: {
    userId?: string;
    newUser?: { phoneE164: string; countryOrigin: 'GR' | 'ABROAD'; passwordHash: string };
    origin: string;
    identityValue: string; // AFM or PASSPORT value
    bookingRef: string;
    lastName: string;
  }): Promise<{ booking: Booking; access: BookingAccess; userId: string }> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        let userId = params.userId;
        if (!userId && params.newUser) {
          const created = await tx.user.create({
            data: {
              id: crypto.randomUUID(),
              phoneE164: params.newUser.phoneE164,
              countryOrigin: params.newUser.countryOrigin,
              passwordHash: params.newUser.passwordHash,
            },
          });
          userId = created.id;
        }
        if (!userId) throw new Error('A user or new-user payload is required');

        // 1. Upsert identity
        const identityType: IdentityType = params.origin === 'GR' ? 'AFM' : 'PASSPORT';
        const { hash: valueHash, salt: valueSalt } = hashSensitive(params.identityValue);
        const last4Mask = maskLast4(params.identityValue);
        
        await tx.identity.upsert({
          where: {
            userId_type: {
              userId,
              type: identityType,
            },
          },
          create: {
            userId,
            type: identityType,
            valueHash,
            salt: valueSalt,
            last4Mask,
            verifiedAt: null,
          },
          update: {
            valueHash,
            salt: valueSalt,
            last4Mask,
            verifiedAt: null,
          },
        });

        // 2. Only a pre-existing reservation may grant portal access.
        const bookingDb = await findAndClaimExistingBooking(tx, {
          userId,
          reference: params.bookingRef,
          lastName: params.lastName,
        });

        // 3. Grant access
        const accessDb = await tx.access.upsert({
          where: {
            userId_bookingId: {
              userId,
              bookingId: bookingDb.id,
            },
          },
          create: {
            userId,
            bookingId: bookingDb.id,
            status: 'VERIFIED',
          },
          update: {
            status: 'VERIFIED',
          },
        });

        const booking: Booking = mapBookingFromDb(bookingDb);
        const access: BookingAccess = mapAccessFromDb(accessDb);

        return { booking, access, userId };
      });

      logger.info('guestStore: linkUserToBookingWithAccess completed', {
        userId: result.userId,
        bookingId: result.booking.id,
      });

      guestDataCache.invalidate(['identities', 'bookings', 'access']);
      return result;
    } catch (error) {
      logger.error('guestStore: failed to link user to booking with access (transaction rolled back)', error);
      throw error;
    }
  },

  /**
   * Registers an onsite guest with booking and access in one atomic operation.
   * All operations succeed or fail together.
   * 
   * Used by: portal/onsite/confirm/route.ts
   * 
   * @param params - Guest registration parameters
   * @returns User, booking, and access records (snake_case)
   */
  async registerOnsiteGuest(params: {
    phone: string;
    origin: string;
    bookingId: string;
    grant: { jti: string; expiresAt: Date };
  }): Promise<{ user: User; booking: Booking; access: BookingAccess }> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const now = new Date();
        if (params.grant.expiresAt <= now) throw new OnsiteGrantRejectedError();

        // The unique grant record makes a signed POS token one-use.
        try {
          await tx.onsiteGrant.create({
            data: {
              jti: params.grant.jti,
              bookingId: params.bookingId,
              expiresAt: params.grant.expiresAt,
              consumedAt: now,
            },
          });
        } catch {
          throw new OnsiteGrantRejectedError();
        }

        const normalized = normalizePhone(params.phone, params.origin as 'GR' | 'ABROAD');
        if (!normalized) throw new Error('Invalid E.164 phone number');

        // 1. Find or create a uniquely identified user.
        const userDb = await tx.user.upsert({
          where: { phoneE164: normalized.e164 },
          create: {
            id: crypto.randomUUID(),
            phoneE164: normalized.e164,
            countryOrigin: params.origin as 'GR' | 'ABROAD',
            passwordHash: null,
          },
          update: {},
        });

        // 2. A POS grant may only claim the booking named in the signed token.
        const bookingDb = await findAndClaimExistingBooking(tx, {
          userId: userDb.id,
          bookingId: params.bookingId,
        });

        // 3. Grant access
        const accessDb = await tx.access.upsert({
          where: {
            userId_bookingId: {
              userId: userDb.id,
              bookingId: bookingDb.id,
            },
          },
          create: {
            userId: userDb.id,
            bookingId: bookingDb.id,
            status: 'VERIFIED',
          },
          update: {
            status: 'VERIFIED',
          },
        });

        const user: User = mapUserFromDb(userDb);
        const booking: Booking = mapBookingFromDb(bookingDb);
        const access: BookingAccess = mapAccessFromDb(accessDb);

        return { user, booking, access };
      });

      logger.info('guestStore: registerOnsiteGuest completed', {
        userId: result.user.id,
        bookingId: result.booking.id,
      });

      guestDataCache.invalidate(['users', 'bookings', 'access']);
      return result;
    } catch (error) {
      logger.error('guestStore: failed to register onsite guest (transaction rolled back)', error);
      throw error;
    }
  },
};
