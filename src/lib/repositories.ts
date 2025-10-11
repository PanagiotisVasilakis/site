import { getDatabase } from '@/lib/database';
import { logger } from '@/lib/logger';

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
  created_at: number;
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

// Repository classes
export class UserRepository {
  async create(input: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const db = await getDatabase();
    const id = this.generateId('usr');
    const now = Date.now();
    
    await db.run(
      `INSERT INTO users (id, email, phone_e164, password_hash, country_origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.email,
      input.phone_e164,
      input.password_hash,
      input.country_origin,
      now,
      now
    );
    
    logger.info('User created', { userId: id });
    
    return {
      id,
      email: input.email,
      phone_e164: input.phone_e164,
      password_hash: input.password_hash,
      country_origin: input.country_origin,
      created_at: now,
      updated_at: now
    };
  }
  
  async findByPhone(phone: string): Promise<User | undefined> {
    const db = await getDatabase();
    const row = await db.get('SELECT * FROM users WHERE phone_e164 = ?', phone);
    return row as User | undefined;
  }
  
  async findById(id: string): Promise<User | undefined> {
    const db = await getDatabase();
    const row = await db.get('SELECT * FROM users WHERE id = ?', id);
    return row as User | undefined;
  }
  
  async updatePassword(userId: string, password_hash: string): Promise<User | undefined> {
    const db = await getDatabase();
    const now = Date.now();
    
    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      password_hash,
      now,
      userId
    );
    
    return this.findById(userId);
  }

  async getAll(): Promise<User[]> {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM users ORDER BY created_at DESC');
    return rows as User[];
  }
  
  private generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export class IdentityRepository {
  async upsert(userId: string, type: IdentityType, hash: string, salt: string, last4Mask: string): Promise<Identity> {
    const db = await getDatabase();
    const now = Date.now();
    
    // Check if identity already exists
    const existing = await db.get(
      'SELECT * FROM identities WHERE user_id = ? AND type = ?',
      userId,
      type
    );
    
    if (existing) {
      // Update existing identity
      await db.run(
        'UPDATE identities SET value_hash = ?, salt = ?, last4_mask = ?, verified_at = ? WHERE user_id = ? AND type = ?',
        hash,
        salt,
        last4Mask,
        now,
        userId,
        type
      );
      
      logger.info('Identity updated', { userId, type });
      
      return {
        user_id: userId,
        type,
        value_hash: hash,
        salt,
        last4_mask: last4Mask,
        verified_at: now
      };
    } else {
      // Insert new identity
      await db.run(
        'INSERT INTO identities (user_id, type, value_hash, salt, last4_mask, verified_at) VALUES (?, ?, ?, ?, ?, ?)',
        userId,
        type,
        hash,
        salt,
        last4Mask,
        now
      );
      
      logger.info('Identity created', { userId, type });
      
      return {
        user_id: userId,
        type,
        value_hash: hash,
        salt,
        last4_mask: last4Mask,
        verified_at: now
      };
    }
  }

  async getAll(): Promise<Identity[]> {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM identities ORDER BY user_id ASC, type ASC');
    return rows as Identity[];
  }
}

export class BookingRepository {
  async create(params: Omit<Booking, 'id' | 'created_at'>): Promise<Booking> {
    const db = await getDatabase();
    const id = this.generateId('bkg');
    const now = Date.now();
    
    await db.run(
      `INSERT INTO bookings (
        id, source, reference, last_name_hash, last_name_salt, last_name_token, 
        last_name_token_nows, start_date, end_date, user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      params.source,
      params.reference,
      params.last_name_hash,
      params.last_name_salt,
      params.last_name_token,
      params.last_name_token_nows,
      params.start_date,
      params.end_date,
      params.user_id,
      now
    );
    
    logger.info('Booking created', { bookingId: id });
    
    return {
      id,
      source: params.source,
      reference: params.reference,
      last_name_hash: params.last_name_hash,
      last_name_salt: params.last_name_salt,
      last_name_token: params.last_name_token,
      last_name_token_nows: params.last_name_token_nows,
      start_date: params.start_date,
      end_date: params.end_date,
      user_id: params.user_id,
      created_at: now
    };
  }
  
  async findByReferenceAndLastName(reference: string, lastNameToken: string, lastNameTokenNoWs: string): Promise<Booking | undefined> {
    const db = await getDatabase();
    const row = await db.get(
      `SELECT * FROM bookings WHERE reference = ? AND (
        last_name_token = ? OR 
        last_name_token = ? OR 
        last_name_token_nows = ? OR 
        last_name_token_nows = ?
      )`,
      reference,
      lastNameToken,
      lastNameTokenNoWs,
      lastNameToken,
      lastNameTokenNoWs
    );
    
    return row as Booking | undefined;
  }
  
  async findById(id: string): Promise<Booking | undefined> {
    const db = await getDatabase();
    const row = await db.get('SELECT * FROM bookings WHERE id = ?', id);
    return row as Booking | undefined;
  }
  
  async findEligibleForUser(userId: string, nowDateISO: string = new Date().toISOString().slice(0,10)): Promise<Booking | undefined> {
    const db = await getDatabase();
    const rows = await db.all(
      `SELECT * FROM bookings 
       WHERE user_id = ? AND end_date >= ? 
       ORDER BY start_date ASC`,
      userId,
      nowDateISO
    );
    
    return rows[0] as Booking | undefined;
  }

  async getAll(): Promise<Booking[]> {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM bookings ORDER BY created_at DESC');
    return rows as Booking[];
  }
  
  private generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export class AccessRepository {
  async set(userId: string, bookingId: string, status: AccessStatus): Promise<BookingAccess> {
    const db = await getDatabase();
    const now = Date.now();
    
    // Check if access record already exists
    const existing = await db.get(
      'SELECT * FROM access WHERE user_id = ? AND booking_id = ?',
      userId,
      bookingId
    );
    
    if (existing) {
      // Update existing access record
      await db.run(
        'UPDATE access SET status = ?, updated_at = ? WHERE user_id = ? AND booking_id = ?',
        status,
        now,
        userId,
        bookingId
      );
      
      logger.info('Access record updated', { userId, bookingId, status });
      
      return {
        user_id: userId,
        booking_id: bookingId,
        status,
        created_at: existing.created_at,
        updated_at: now
      };
    } else {
      // Insert new access record
      await db.run(
        'INSERT INTO access (user_id, booking_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        userId,
        bookingId,
        status,
        now,
        now
      );
      
      logger.info('Access record created', { userId, bookingId, status });
      
      return {
        user_id: userId,
        booking_id: bookingId,
        status,
        created_at: now,
        updated_at: now
      };
    }
  }

  async listByUser(userId: string): Promise<BookingAccess[]> {
    const db = await getDatabase();
    const rows = await db.all(
      'SELECT * FROM access WHERE user_id = ? ORDER BY updated_at DESC',
      userId
    );
    return rows as BookingAccess[];
  }

  async getAll(): Promise<BookingAccess[]> {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM access ORDER BY updated_at DESC');
    return rows as BookingAccess[];
  }
}

export class SessionRepository {
  async create(userId: string, bookingId: string, expiresAt: number): Promise<AuthSessionRec> {
    const db = await getDatabase();
    const id = this.generateId('sess');
    const now = Date.now();
    
    await db.run(
      'INSERT INTO sessions (id, user_id, booking_id, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      userId,
      bookingId,
      expiresAt,
      null,
      now
    );
    
    logger.info('Session created', { sessionId: id, userId, bookingId });
    
    return {
      id,
      user_id: userId,
      booking_id: bookingId,
      expires_at: expiresAt,
      revoked_at: undefined,
      created_at: now
    };
  }
  
  async revoke(id: string): Promise<boolean> {
    const db = await getDatabase();
    const now = Date.now();
    
    const result = await db.run(
      'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      now,
      id
    );
    
  const changed = (result.changes ?? 0) > 0;
    if (changed) {
      logger.info('Session revoked', { sessionId: id });
    }
    
    return changed;
  }
  
  private generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export class CheckinRepository {
  async upsert(bookingId: string, arrivalTime: string, specialRequests?: string): Promise<CheckinCompletionRec> {
    const db = await getDatabase();
    const now = Date.now();
    
    // Check if checkin record already exists
    const existing = await db.get(
      'SELECT * FROM checkins WHERE booking_id = ?',
      bookingId
    );
    
    if (existing) {
      // Update existing checkin record
      await db.run(
        'UPDATE checkins SET arrival_time = ?, special_requests = ?, accepted_at = ? WHERE booking_id = ?',
        arrivalTime,
        specialRequests,
        now,
        bookingId
      );
      
      logger.info('Checkin record updated', { bookingId });
      
      return {
        booking_id: bookingId,
        arrival_time: arrivalTime,
        special_requests: specialRequests,
        accepted_at: now
      };
    } else {
      // Insert new checkin record
      await db.run(
        'INSERT INTO checkins (booking_id, arrival_time, special_requests, accepted_at) VALUES (?, ?, ?, ?)',
        bookingId,
        arrivalTime,
        specialRequests,
        now
      );
      
      logger.info('Checkin record created', { bookingId });
      
      return {
        booking_id: bookingId,
        arrival_time: arrivalTime,
        special_requests: specialRequests,
        accepted_at: now
      };
    }
  }
  
  async getByBookingId(bookingId: string): Promise<CheckinCompletionRec | undefined> {
    const db = await getDatabase();
    const row = await db.get('SELECT * FROM checkins WHERE booking_id = ?', bookingId);
    return row as CheckinCompletionRec | undefined;
  }

  async getAll(): Promise<CheckinCompletionRec[]> {
    const db = await getDatabase();
    const rows = await db.all('SELECT * FROM checkins ORDER BY accepted_at DESC');
    return rows as CheckinCompletionRec[];
  }
}

export class RefreshTokenRepository {
  async create(
    userId: string,
    tokenHash: string,
    salt: string,
    familyId: string,
    expiresAt: number,
    opts?: {
      deviceId?: string;
      ipHint?: string;
    }
  ): Promise<GuestRefreshTokenRec> {
    const db = await getDatabase();
    const id = this.generateId('rt');
    const now = Date.now();
    
    await db.run(
      `INSERT INTO refresh_tokens (
        id, user_id, token_hash, salt, family_id, created_at, expires_at, 
        revoked_at, rotated_from_id, last_used_at, device_hint, ip_hint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      tokenHash,
      salt,
      familyId,
      now,
      expiresAt,
      null,
      null,
      null,
      opts?.deviceId || null,
      opts?.ipHint || null
    );
    
    logger.info('Refresh token created', { tokenId: id, userId, familyId });
    
    return {
      id,
      user_id: userId,
      token_hash: tokenHash,
      salt,
      family_id: familyId,
      created_at: now,
      expires_at: expiresAt,
      revoked_at: undefined,
      rotated_from_id: undefined,
      last_used_at: undefined,
      device_hint: opts?.deviceId,
      ip_hint: opts?.ipHint
    };
  }
  
  async verify(tokenHash: string): Promise<GuestRefreshTokenRec | undefined> {
    const db = await getDatabase();
    const now = Date.now();
    
    const row = await db.get(
      `SELECT * FROM refresh_tokens 
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
      tokenHash,
      now
    );
    
    if (row) {
      // Update last used timestamp
      await db.run(
        'UPDATE refresh_tokens SET last_used_at = ? WHERE id = ?',
        now,
        row.id
      );
      
      return row as GuestRefreshTokenRec;
    }
    
    return undefined;
  }
  
  async revoke(id: string): Promise<boolean> {
    const db = await getDatabase();
    const now = Date.now();
    
    const result = await db.run(
      'UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      now,
      id
    );
    
  const changed = (result.changes ?? 0) > 0;
    if (changed) {
      logger.info('Refresh token revoked', { tokenId: id });
    }
    
    return changed;
  }
  
  async purgeExpired(maxAgeDaysPastExpiry: number = 30): Promise<number> {
    const db = await getDatabase();
    const cutoff = Date.now() - maxAgeDaysPastExpiry * 24 * 60 * 60 * 1000;
    
    const result = await db.run(
      'DELETE FROM refresh_tokens WHERE expires_at < ?',
      cutoff
    );
    
  const removed = result.changes ?? 0;
  if (removed > 0) {
      logger.info('Expired refresh tokens purged', { count: removed });
    }
    
  return removed;
  }
  
  private generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// Export singleton instances
export const userRepository = new UserRepository();
export const identityRepository = new IdentityRepository();
export const bookingRepository = new BookingRepository();
export const accessRepository = new AccessRepository();
export const sessionRepository = new SessionRepository();
export const checkinRepository = new CheckinRepository();
export const refreshTokenRepository = new RefreshTokenRepository();