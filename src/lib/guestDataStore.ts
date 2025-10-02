import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { encryptJSON, decryptJSON, hashSensitive, maskLast4, verifySensitive, encryptString, decryptString, hmacDeterministic } from '@/lib/crypto';
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

// Persisted variant with encrypted phone and HMAC for lookup
interface PersistedUser {
  id: string;
  email?: string;
  phone_enc: string; // AES-GCM base64
  phone_hmac: string; // deterministic HMAC-SHA256
  password_hash?: string; // bcrypt hash (already secure, no need to encrypt)
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

// Legacy codepath removed

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

// Persisted JSON shape (phone encrypted)
interface DBShapePersisted {
  users: PersistedUser[];
  identities: Identity[];
  bookings: Booking[];
  access: BookingAccess[];
  sessions: AuthSessionRec[];
  checkins: CheckinCompletionRec[];
  refreshTokens: GuestRefreshTokenRec[];
  _v: number;
}

// Runtime in-memory shape (phone plaintext, used within process only)
interface RuntimeDB {
  users: User[];
  identities: Identity[];
  bookings: Booking[];
  access: BookingAccess[];
  sessions: AuthSessionRec[];
  checkins: CheckinCompletionRec[];
  refreshTokens: GuestRefreshTokenRec[];
  _v: number;
}

const FILE = path.join(process.cwd(), 'secure-data.enc.json');

function readDB(): RuntimeDB {
  if (!fs.existsSync(FILE)) return { users: [], identities: [], bookings: [], access: [], sessions: [], checkins: [], refreshTokens: [], _v: 1 } as RuntimeDB;
  try {
    const raw = fs.readFileSync(FILE, 'utf-8');
    const pdb = decryptJSON<DBShapePersisted>(raw);
    // Map persisted users to runtime users with decrypted phone
    const users: User[] = (pdb.users || []).map((pu) => ({
      id: pu.id,
      email: pu.email,
      phone_e164: safeDecryptPhone(pu.phone_enc),
      password_hash: pu.password_hash,
      country_origin: pu.country_origin,
      created_at: pu.created_at,
      updated_at: pu.updated_at,
    }));
    // Backfill booking tokens from legacy normalized plaintext if present
    const bookings: Booking[] = (pdb.bookings || []).map((raw) => {
      const b = { ...raw } as Partial<Booking> & { last_name_plain_lower?: string; last_name_plain_lower_nows?: string };
      if (!b.last_name_token && b.last_name_plain_lower) {
        b.last_name_token = hmacDeterministic(b.last_name_plain_lower);
      }
      if (!b.last_name_token_nows && b.last_name_plain_lower_nows) {
        b.last_name_token_nows = hmacDeterministic(b.last_name_plain_lower_nows);
      }
      delete b.last_name_plain_lower;
      delete b.last_name_plain_lower_nows;
      return b as Booking;
    });

    const runtime: RuntimeDB = {
      users,
      identities: pdb.identities || [],
      bookings,
      access: pdb.access || [],
      sessions: pdb.sessions || [],
      checkins: pdb.checkins || [],
      refreshTokens: pdb.refreshTokens || [],
      _v: pdb._v || 1,
    };
    // Backfill for older versions without checkins
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
  if (!runtime.checkins) (runtime as unknown as RuntimeDB).checkins = [];
    // Backfill for older versions without refresh tokens
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (!runtime.refreshTokens) (runtime as unknown as RuntimeDB).refreshTokens = [];
    return runtime;
  } catch (err) {
    logger.error('guestDataStore: failed to read DB', err);
    return { users: [], identities: [], bookings: [], access: [], sessions: [], checkins: [], refreshTokens: [], _v: 1 } as RuntimeDB;
  }
}

function writeDB(db: RuntimeDB) {
  // Convert runtime DB to persisted JSON (encrypt phone)
  const toWrite: DBShapePersisted = {
    ...db,
    users: (db.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      phone_enc: encryptString(u.phone_e164),
      phone_hmac: hmacDeterministic(u.phone_e164),
      password_hash: u.password_hash,
      country_origin: u.country_origin,
      created_at: u.created_at,
      updated_at: u.updated_at,
    })),
  } as DBShapePersisted;
  const b64 = encryptJSON(toWrite);
  fs.writeFileSync(FILE, b64, 'utf-8');
}

function id(prefix: string = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const guestStore = {
  // Users
  createUser(input: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const db = readDB();
    const u: User = { id: id('usr'), created_at: Date.now(), updated_at: Date.now(), ...input };
    db.users.push(u);
    writeDB(db);
    return u;
  },
  findUserByPhone(phone: string): User | undefined {
    const db = readDB();
    return db.users.find(u => u.phone_e164 === phone);
  },
  findUserById(user_id: string): User | undefined {
    const db = readDB();
    return db.users.find(u => u.id === user_id);
  },
  updateUserPassword(user_id: string, password_hash: string): User | undefined {
    const db = readDB();
    const user = db.users.find(u => u.id === user_id);
    if (!user) return undefined;
    user.password_hash = password_hash;
    user.updated_at = Date.now();
    writeDB(db);
    return user;
  },

  // Identity
  upsertIdentity(user_id: string, type: IdentityType, rawValue: string): Identity {
    const db = readDB();
    const { hash, salt } = hashSensitive(rawValue);
    const last4 = maskLast4(rawValue);
    const existing = db.identities.find(i => i.user_id === user_id && i.type === type);
    if (existing) {
      existing.value_hash = hash; existing.salt = salt; existing.last4_mask = last4; existing.verified_at = Date.now();
      writeDB(db);
      return existing;
    }
    const rec: Identity = { user_id, type, value_hash: hash, salt, last4_mask: last4, verified_at: Date.now() };
    db.identities.push(rec);
    writeDB(db);
    return rec;
  },

  // Booking
  linkOrCreateBooking(params: Omit<Booking, 'id' | 'created_at' | 'last_name_hash' | 'last_name_salt' | 'last_name_plain_lower' | 'last_name_plain_lower_nows'> & { last_name?: string }): Booking {
    const db = readDB();
    const existing = params.reference ? db.bookings.find(b => b.reference === params.reference) : undefined;
    if (existing) return existing;
    let last_name_hash: string | undefined; let last_name_salt: string | undefined;
    if (params.last_name) { const r = hashSensitive(params.last_name); last_name_hash = r.hash; last_name_salt = r.salt; }
  const lnLower = params.last_name?.toLowerCase();
  const lnNowhitespace = lnLower?.replace(/\s+/g, '');
  const rec: Booking = { id: id('bkg'), created_at: Date.now(), source: params.source, reference: params.reference, start_date: params.start_date, end_date: params.end_date, user_id: params.user_id, last_name_hash, last_name_salt, last_name_token: lnLower ? hmacDeterministic(lnLower) : undefined, last_name_token_nows: lnNowhitespace ? hmacDeterministic(lnNowhitespace) : undefined };
    db.bookings.push(rec);
    writeDB(db);
    return rec;
  },
  findBookingByReferenceAndLastName(reference: string, lastName: string): Booking | undefined {
    const db = readDB();
    const ln = lastName.toLowerCase();
    const lnNows = ln.replace(/\s+/g, '');
    const tokenLower = hmacDeterministic(ln);
    const tokenNoWs = hmacDeterministic(lnNows);
    // Accept matches where either stored token equals either input token variant
    const cand = db.bookings.find((b) =>
      b.reference === reference && (
        b.last_name_token === tokenLower ||
        b.last_name_token === tokenNoWs ||
        b.last_name_token_nows === tokenLower ||
        b.last_name_token_nows === tokenNoWs
      )
    );
    return cand;
  },
  findBookingById(id: string): Booking | undefined {
    const db = readDB();
    return db.bookings.find(b => b.id === id);
  },
  findEligibleBookingForUser(user_id: string, nowDateISO: string = new Date().toISOString().slice(0,10)): Booking | undefined {
    const db = readDB();
    const candidates = db.bookings.filter(b => b.user_id === user_id && b.end_date >= nowDateISO);
    if (candidates.length === 0) return undefined;
    // Prefer the nearest upcoming by start_date
    candidates.sort((a, b) => (a.start_date.localeCompare(b.start_date)));
    return candidates[0];
  },

  // Access
  setAccess(user_id: string, booking_id: string, status: AccessStatus): BookingAccess {
    const db = readDB();
    const existing = db.access.find(a => a.user_id === user_id && a.booking_id === booking_id);
    if (existing) { existing.status = status; existing.updated_at = Date.now(); writeDB(db); return existing; }
    const rec: BookingAccess = { user_id, booking_id, status, created_at: Date.now(), updated_at: Date.now() };
    db.access.push(rec); writeDB(db); return rec;
  },

  // Check-in completion (development store only)
  upsertCheckinCompletion(booking_id: string, data: { arrival_time: string; special_requests?: string }): CheckinCompletionRec {
    const db = readDB();
    const existing = db.checkins.find(c => c.booking_id === booking_id);
    if (existing) {
      existing.arrival_time = data.arrival_time;
      existing.special_requests = data.special_requests;
      existing.accepted_at = Date.now();
      writeDB(db);
      return existing;
    }
    const rec: CheckinCompletionRec = {
      booking_id,
      arrival_time: data.arrival_time,
      special_requests: data.special_requests,
      accepted_at: Date.now(),
    };
    db.checkins.push(rec);
    writeDB(db);
    return rec;
  },
  getCheckinCompletionByBooking(booking_id: string): CheckinCompletionRec | undefined {
    const db = readDB();
    return db.checkins.find(c => c.booking_id === booking_id);
  },

  // Refresh tokens (development store only)
  issueRefreshToken(user_id: string, ttlDays = 60, opts?: { family_id?: string; device_hint?: string; ip_hint?: string }): { rec: GuestRefreshTokenRec; token: string } {
    const db = readDB();
    const token = crypto.randomBytes(32).toString('base64url');
    const { hash, salt } = hashSensitive(token);
    const family_id = opts?.family_id || id('rtfam');
    const rec: GuestRefreshTokenRec = {
      id: id('rt'),
      user_id,
      token_hash: hash,
      salt,
      family_id,
      created_at: Date.now(),
      expires_at: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
      device_hint: opts?.device_hint,
      ip_hint: opts?.ip_hint,
    };
    db.refreshTokens.push(rec);
    writeDB(db);
    return { rec, token };
  },
  verifyRefreshToken(token: string): GuestRefreshTokenRec | undefined {
    const db = readDB();
    const now = Date.now();
    for (const rec of db.refreshTokens) {
      if (rec.revoked_at) continue;
      if (rec.expires_at <= now) continue;
      if (verifySensitive(token, rec.salt, rec.token_hash)) {
        rec.last_used_at = now;
        writeDB(db);
        return rec;
      }
    }
    return undefined;
  },
  revokeRefreshToken(idOrToken: string): boolean {
    const db = readDB();
    const now = Date.now();
    let changed = false;
    const byId = db.refreshTokens.find(r => r.id === idOrToken);
    if (byId && !byId.revoked_at) { byId.revoked_at = now; changed = true; }
    if (!byId) {
      // try by plain token match
      for (const rec of db.refreshTokens) {
        if (rec.revoked_at) continue;
        if (verifySensitive(idOrToken, rec.salt, rec.token_hash)) { rec.revoked_at = now; changed = true; break; }
      }
    }
    if (changed) writeDB(db);
    return changed;
  },
  rotateRefreshToken(oldToken: string, ttlDays = 60): { old?: GuestRefreshTokenRec; rec?: GuestRefreshTokenRec; token?: string } {
    const db = readDB();
    const old = this.verifyRefreshToken(oldToken);
    if (!old) return {};
    old.revoked_at = Date.now();
    writeDB(db);
    const { rec, token } = this.issueRefreshToken(old.user_id, ttlDays, { family_id: old.family_id, device_hint: old.device_hint, ip_hint: old.ip_hint });
    rec.rotated_from_id = old.id;
    const db2 = readDB();
    const idx = db2.refreshTokens.findIndex(r => r.id === rec.id);
    if (idx >= 0) { db2.refreshTokens[idx] = rec; writeDB(db2); }
    return { old, rec, token };
  },
  purgeExpiredRefreshTokens(maxAgeDaysPastExpiry = 30): number {
    const db = readDB();
    const cutoff = Date.now() - maxAgeDaysPastExpiry * 24 * 60 * 60 * 1000;
    const before = db.refreshTokens.length;
    db.refreshTokens = db.refreshTokens.filter(r => r.expires_at > cutoff);
    const removed = before - db.refreshTokens.length;
    if (removed > 0) writeDB(db);
    return removed;
  },
  // DSAR helpers (read-only)
  listAccessByUser(user_id: string): BookingAccess[] {
    const db = readDB();
    return db.access.filter(a => a.user_id === user_id);
  },

  // Admin helpers - get all data for export/analysis
  getAllBookings(): Booking[] {
    const db = readDB();
    return db.bookings || [];
  },

  getAllUsers(): User[] {
    const db = readDB();
    return db.users || [];
  },

  getAllIdentities(): Identity[] {
    const db = readDB();
    return db.identities || [];
  },

  getAllCheckins(): CheckinCompletionRec[] {
    const db = readDB();
    return db.checkins || [];
  },

  getAllAccess(): BookingAccess[] {
    const db = readDB();
    return db.access || [];
  },
};

function safeDecryptPhone(enc: string): string {
  try { return decryptString(enc); } catch { return ''; }
}
