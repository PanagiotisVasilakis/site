import { initializeDatabase, getDatabase } from '@/lib/database';
import {
  userRepository,
  identityRepository,
  bookingRepository,
  accessRepository,
  checkinRepository,
  refreshTokenRepository
} from '@/lib/repositories';
import { hashSensitive, maskLast4, hmacDeterministic, verifySensitive } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import crypto from 'node:crypto';

export type IdentityType = 'AFM' | 'PASSPORT';
export type BookingSource = 'ONSITE' | 'EXTERNAL';
export type AccessStatus = 'PENDING' | 'VERIFIED';

export interface User {
  id: string;
  email?: string;
  phone_e164: string;
  password_hash?: string; // bcrypt hash
  country_origin: 'GR' | 'ABROAD';
  created_at: number;
  updated_at: number;
}

export interface Identity {
  user_id: string;
  type: IdentityType;
  value_hash: string;
  salt: string;
  last4_mask: string;
  verified_at?: number;
}

export interface Booking {
  id: string;
  source: BookingSource;
  reference?: string;
  last_name_hash?: string;
  last_name_salt?: string;
  // Deterministic tokens derived from normalized last name
  last_name_token?: string; // hmac(lowercase)
  last_name_token_nows?: string; // hmac(lowercase without whitespace)
  start_date: string; // ISO
  end_date: string;   // ISO
  user_id?: string;
  created_at: number;
}

export interface BookingAccess {
  user_id: string;
  booking_id: string;
  status: AccessStatus;
  created_at: number;
  updated_at: number;
}

export interface AuthSessionRec {
  id: string;
  user_id: string;
  booking_id: string;
  expires_at: number;
  revoked_at?: number;
}

export interface CheckinCompletionRec {
  booking_id: string;
  arrival_time: string; // HH:mm
  special_requests?: string;
  accepted_at: number; // ms epoch
}

export interface GuestRefreshTokenRec {
  id: string;
  user_id: string;
  token_hash: string;
  salt: string;
  family_id: string; // rotation family
  created_at: number;
  expires_at: number;
  revoked_at?: number;
  rotated_from_id?: string;
  last_used_at?: number;
  device_hint?: string;
  ip_hint?: string;
}

// Initialize database on module load
initializeDatabase().catch((error) => {
  logger.error('Failed to initialize database', { error });
});

export const guestStore = {
  // Users
  async createUser(input: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    try {
      return await userRepository.create(input);
    } catch (error) {
      logger.error('guestStore: failed to create user', error);
      throw error;
    }
  },
  
  async findUserByPhone(phone: string): Promise<User | undefined> {
    try {
      return await userRepository.findByPhone(phone);
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
      return await userRepository.updatePassword(user_id, password_hash);
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
      return await identityRepository.upsert(user_id, type, hash, salt, last4);
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
        const lnLower = params.last_name?.toLowerCase() || '';
        const lnNowhitespace = lnLower.replace(/\s+/g, '');
        const tokenLower = lnLower ? hmacDeterministic(lnLower) : '';
        const tokenNoWs = lnNowhitespace ? hmacDeterministic(lnNowhitespace) : '';
        
        const existing = await bookingRepository.findByReferenceAndLastName(
          params.reference,
          tokenLower,
          tokenNoWs
        );
        if (existing) return existing;
      }
      
      let last_name_hash: string | undefined;
      let last_name_salt: string | undefined;
      
      if (params.last_name) {
        const r = hashSensitive(params.last_name);
        last_name_hash = r.hash;
        last_name_salt = r.salt;
      }
      
      const lnLower = params.last_name?.toLowerCase();
      const lnNowhitespace = lnLower?.replace(/\s+/g, '');
      
      return await bookingRepository.create({
        source: params.source,
        reference: params.reference,
        start_date: params.start_date,
        end_date: params.end_date,
        user_id: params.user_id,
        last_name_hash,
        last_name_salt,
        last_name_token: lnLower ? hmacDeterministic(lnLower) : undefined,
        last_name_token_nows: lnNowhitespace ? hmacDeterministic(lnNowhitespace) : undefined
      });
    } catch (error) {
      logger.error('guestStore: failed to link or create booking', error);
      throw error;
    }
  },
  
  async findBookingByReferenceAndLastName(reference: string, lastName: string): Promise<Booking | undefined> {
    try {
      const ln = lastName.toLowerCase();
      const lnNows = ln.replace(/\s+/g, '');
      const tokenLower = hmacDeterministic(ln);
      const tokenNoWs = hmacDeterministic(lnNows);
      
      // Accept matches where either stored token equals either input token variant
      return await bookingRepository.findByReferenceAndLastName(
        reference,
        tokenLower,
        tokenNoWs
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
      return await accessRepository.set(user_id, booking_id, status);
    } catch (error) {
      logger.error('guestStore: failed to set access', error);
      throw error;
    }
  },

  // Check-in completion (development store only)
  async upsertCheckinCompletion(booking_id: string, data: { arrival_time: string; special_requests?: string }): Promise<CheckinCompletionRec> {
    try {
      return await checkinRepository.upsert(booking_id, data.arrival_time, data.special_requests);
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

  // Refresh tokens (development store only)
  async issueRefreshToken(user_id: string, ttlDays = 60, opts?: { family_id?: string; device_hint?: string; ip_hint?: string }): Promise<{ rec: GuestRefreshTokenRec; token: string }> {
    try {
      const token = crypto.randomBytes(32).toString('base64url');
      const { hash, salt } = hashSensitive(token);
      const family_id = opts?.family_id || `rtfam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      
      const rec = await refreshTokenRepository.create(
        user_id,
        hash,
        salt,
        family_id,
        Date.now() + ttlDays * 24 * 60 * 60 * 1000,
        {
          deviceId: opts?.device_hint,
          ipHint: opts?.ip_hint
        }
      );
      
      return { rec, token };
    } catch (error) {
      logger.error('guestStore: failed to issue refresh token', error);
      throw error;
    }
  },
  
  async verifyRefreshToken(token: string): Promise<GuestRefreshTokenRec | undefined> {
    try {
      const db = await getDatabase();
      const now = Date.now();
      const rows = await db.all(
        'SELECT * FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > ?',
        now
      );
      for (const row of rows as GuestRefreshTokenRec[]) {
        if (verifySensitive(token, row.salt, row.token_hash)) {
          await db.run('UPDATE refresh_tokens SET last_used_at = ? WHERE id = ?', now, row.id);
          return row;
        }
      }
      return undefined;
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
      
      // If that fails, try by token hash
      const { hash } = hashSensitive(idOrToken);
      const db = await getDatabase();
      const row = await db.get('SELECT id FROM refresh_tokens WHERE token_hash = ?', hash);
      
      if (row) {
        return await refreshTokenRepository.revoke(row.id);
      }
      
      return false;
    } catch (error) {
      logger.error('guestStore: failed to revoke refresh token', error);
      return false;
    }
  },
  
  async rotateRefreshToken(oldToken: string, ttlDays = 60): Promise<{ old?: GuestRefreshTokenRec; rec?: GuestRefreshTokenRec; token?: string }> {
    try {
      const old = await this.verifyRefreshToken(oldToken);
      if (!old) return {};
      
      // Revoke the old token
      await refreshTokenRepository.revoke(old.id);
      
      // Issue a new token
      const { rec, token } = await this.issueRefreshToken(old.user_id, ttlDays, { 
        family_id: old.family_id, 
        device_hint: old.device_hint, 
        ip_hint: old.ip_hint 
      });
      
      rec.rotated_from_id = old.id;
      
      // Update the new token record
      const db = await getDatabase();
      await db.run(
        'UPDATE refresh_tokens SET rotated_from_id = ? WHERE id = ?',
        old.id,
        rec.id
      );
      
      return { old, rec, token };
    } catch (error) {
      logger.error('guestStore: failed to rotate refresh token', error);
      return {};
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
      return await bookingRepository.getAll();
    } catch (error) {
      logger.error('guestStore: failed to get all bookings', error);
      return [];
    }
  },

  async getAllUsers(): Promise<User[]> {
    try {
      return await userRepository.getAll();
    } catch (error) {
      logger.error('guestStore: failed to get all users', error);
      return [];
    }
  },

  async getAllIdentities(): Promise<Identity[]> {
    try {
      return await identityRepository.getAll();
    } catch (error) {
      logger.error('guestStore: failed to get all identities', error);
      return [];
    }
  },

  async getAllCheckins(): Promise<CheckinCompletionRec[]> {
    try {
      return await checkinRepository.getAll();
    } catch (error) {
      logger.error('guestStore: failed to get all checkins', error);
      return [];
    }
  },

  async getAllAccess(): Promise<BookingAccess[]> {
    try {
      return await accessRepository.getAll();
    } catch (error) {
      logger.error('guestStore: failed to get all access records', error);
      return [];
    }
  },
};