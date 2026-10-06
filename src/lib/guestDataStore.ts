import { userRepository, type UserRecord } from '@/lib/prisma-repositories/userRepository';
import { bookingRepository, type BookingRecord } from '@/lib/prisma-repositories/bookingRepository';
import {
  refreshTokenRepository,
  type GuestRefreshTokenRec as PrismaGuestRefreshTokenRec,
  type RefreshSessionBinding,
  type RefreshSessionRecord,
} from '@/lib/prisma-repositories/refreshTokenRepository';
import {
  createGuestSessionToken,
  GUEST_SESSION_TTL_SECONDS,
} from '@/lib/guestSession';
import { hashSensitive } from '@/lib/crypto';
import { logger } from '@/lib/logger-enterprise';
import crypto from 'node:crypto';
import { phoneLookupCandidates } from '@/lib/phone';

export type User = UserRecord;
export type Booking = BookingRecord;

export type GuestRefreshTokenRec = PrismaGuestRefreshTokenRec;

export const guestStore = {
  // Users
  async findUserByPhone(phone: string): Promise<User | undefined> {
    // Same candidates and order as guest sign-in.
    for (const candidate of phoneLookupCandidates(phone)) {
      const user = await userRepository.findByPhone(candidate);
      if (user) return user;
    }
    return undefined;
  },
  
  async findUserById(user_id: string): Promise<User | undefined> {
    return userRepository.findById(user_id);
  },

  // Booking
  async findBookingByReference(reference: string): Promise<Booking | undefined> {
    return bookingRepository.findByReference(reference);
  },
  
  async findBookingById(id: string): Promise<Booking | undefined> {
    return bookingRepository.findById(id);
  },

  // Refresh tokens
  async issueRefreshToken(
    user_id: string,
    ttlDays = 7,
    opts: {
      session_id: string;
      family_id?: string;
      device_hint?: string;
      ip_hint?: string;
    },
  ): Promise<{ rec: GuestRefreshTokenRec; token: string }> {
    try {
      const rawSecret = crypto.randomBytes(32).toString('base64url');
      const { hash, salt } = hashSensitive(rawSecret);
      const family_id = opts?.family_id || crypto.randomUUID();
      
      const rec = await refreshTokenRepository.create(
        user_id,
        opts.session_id,
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
  
  async revokeRefreshFamily(token: string): Promise<boolean> {
    return refreshTokenRepository.revokeFamilyForToken(token);
  },
  
  async rotateRefreshToken(
    oldToken: string,
    ttlDays = 7,
    context: {
      device_hint?: string;
      ip_hint?: string;
      presented_session: RefreshSessionBinding;
    },
  ): Promise<{
    status: 'rotated' | 'invalid' | 'concurrent' | 'replayed';
    old?: GuestRefreshTokenRec;
    rec?: GuestRefreshTokenRec;
    token?: string;
    session?: RefreshSessionRecord;
    sessionToken?: string;
  }> {
    try {
      const now = Date.now();
      const replacementId = crypto.randomUUID();
      const rawSecret = crypto.randomBytes(32).toString('base64url');
      const { hash, salt } = hashSensitive(rawSecret);
      const result = await refreshTokenRepository.rotate(oldToken, {
        id: replacementId,
        tokenHash: hash,
        salt,
        tokenExpiresAt: now + ttlDays * 24 * 60 * 60 * 1000,
        sessionExpiresAt: new Date(now + GUEST_SESSION_TTL_SECONDS * 1000),
        deviceHash: context?.device_hint,
        ipHash: context?.ip_hint,
        presentedSession: context.presented_session,
        createSessionToken: createGuestSessionToken,
      });

      if (result.status !== 'rotated') {
        return { status: result.status };
      }

      return {
        status: 'rotated',
        old: result.old,
        rec: result.rec,
        token: `${result.rec.id}.${rawSecret}`,
        session: result.session,
        sessionToken: result.sessionToken,
      };
    } catch (error) {
      logger.error('guestStore: failed to rotate refresh token', error);
      throw error;
    }
  },
  
  // Admin helpers - get all data for export/analysis
  async getAllBookings(): Promise<Booking[]> {
    return bookingRepository.getAll();
  },

  async getAllUsers(): Promise<User[]> {
    return userRepository.getAll();
  },

};
