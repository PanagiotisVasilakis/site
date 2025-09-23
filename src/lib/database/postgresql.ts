/**
 * PostgreSQL Database Layer
 * Production-ready database implementation for guest data
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { 
  User, 
  Identity, 
  Booking, 
  BookingAccess, 
  AuthSessionRec, 
  CheckinCompletionRec,
  GuestRefreshTokenRec,
  IdentityType,
  BookingSource,
  AccessStatus 
} from '@/lib/guestDataStore';
import { logger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { encryptString, decryptString, hashSensitive, verifySensitive, hmacDeterministic } from '@/lib/crypto';

export interface DatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  maxConnections?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export class PostgreSQLGuestStore {
  private pool: Pool;
  private isConnected = false;

  constructor(config: DatabaseConfig) {
    const poolConfig = config.connectionString 
      ? { connectionString: config.connectionString }
      : {
          host: config.host || 'localhost',
          port: config.port || 5432,
          database: config.database || 'guest_portal',
          user: config.username,
          password: config.password,
        };

    this.pool = new Pool({
      ...poolConfig,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.maxConnections || 20,
      connectionTimeoutMillis: config.connectionTimeoutMs || 5000,
      idleTimeoutMillis: config.idleTimeoutMs || 30000,
    });

    this.pool.on('error', (err) => {
      logger.error('PostgreSQL pool error', err);
      metrics.counter('database_pool_errors', 1);
    });

    this.pool.on('connect', () => {
      logger.info('New PostgreSQL client connected');
      metrics.counter('database_connections_created', 1);
    });

    this.pool.on('remove', () => {
      metrics.counter('database_connections_removed', 1);
    });
  }

  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.isConnected = true;
      logger.info('PostgreSQL connection established');
      metrics.gauge('database_connection_status', 1);
    } catch (error) {
      this.isConnected = false;
      metrics.gauge('database_connection_status', 0);
      logger.error('Failed to connect to PostgreSQL', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      metrics.gauge('database_connection_status', 0);
      logger.info('PostgreSQL connection closed');
    } catch (error) {
      logger.error('Error closing PostgreSQL connection', error);
      throw error;
    }
  }

  private async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      metrics.timer('database_query_duration_ms', Date.now() - start, { operation: 'query' });
      metrics.counter('database_queries_total', 1, { status: 'success' });
      return result;
    } catch (error) {
      metrics.timer('database_query_duration_ms', Date.now() - start, { operation: 'query' });
      metrics.counter('database_queries_total', 1, { status: 'error' });
      logger.error('Database query error', { query: text, params, error });
      throw error;
    }
  }

  private async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      metrics.counter('database_transactions_total', 1, { status: 'committed' });
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      metrics.counter('database_transactions_total', 1, { status: 'rolled_back' });
      throw error;
    } finally {
      client.release();
    }
  }

  // User operations
  async createUser(input: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const id = this.generateId('usr');
    const now = Date.now();
    const phoneEnc = encryptString(input.phone_e164);
    const phoneHmac = hmacDeterministic(input.phone_e164);

    const result = await this.query(
      `INSERT INTO users (id, email, phone_enc, phone_hmac, country_origin, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, input.email, phoneEnc, phoneHmac, input.country_origin, now, now]
    );

    const user: User = {
      id,
      email: input.email,
      phone_e164: input.phone_e164,
      country_origin: input.country_origin,
      created_at: now,
      updated_at: now,
    };

    logger.info('User created', { userId: id, origin: input.country_origin });
    metrics.counter('users_created_total', 1, { origin: input.country_origin });

    return user;
  }

  async findUserByPhone(phone: string): Promise<User | undefined> {
    const phoneHmac = hmacDeterministic(phone);
    const result = await this.query(
      'SELECT * FROM users WHERE phone_hmac = $1 LIMIT 1',
      [phoneHmac]
    );

    if (result.rows.length === 0) return undefined;

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      phone_e164: decryptString(row.phone_enc),
      country_origin: row.country_origin,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async findUserById(userId: string): Promise<User | undefined> {
    const result = await this.query(
      'SELECT * FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );

    if (result.rows.length === 0) return undefined;

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      phone_e164: decryptString(row.phone_enc),
      country_origin: row.country_origin,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // Identity operations
  async upsertIdentity(userId: string, type: IdentityType, rawValue: string): Promise<Identity> {
    const { hash, salt } = hashSensitive(rawValue);
    const last4Mask = `***${rawValue.slice(-4)}`;
    const now = Date.now();

    const result = await this.query(
      `INSERT INTO identities (user_id, type, value_hash, salt, last4_mask, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, type) 
       DO UPDATE SET value_hash = $3, salt = $4, last4_mask = $5, verified_at = $6
       RETURNING *`,
      [userId, type, hash, salt, last4Mask, now]
    );

    const identity: Identity = {
      user_id: userId,
      type,
      value_hash: hash,
      salt,
      last4_mask: last4Mask,
      verified_at: now,
    };

    logger.info('Identity upserted', { userId, type, last4: last4Mask });
    metrics.counter('identities_upserted_total', 1, { type });

    return identity;
  }

  // Booking operations
  async linkOrCreateBooking(params: {
    source: BookingSource;
    reference?: string;
    start_date: string;
    end_date: string;
    user_id?: string;
    last_name?: string;
  }): Promise<Booking> {
    // Check for existing booking by reference
    if (params.reference) {
      const existing = await this.query(
        'SELECT * FROM bookings WHERE reference = $1 LIMIT 1',
        [params.reference]
      );
      if (existing.rows.length > 0) {
        return this.rowToBooking(existing.rows[0]);
      }
    }

    const id = this.generateId('bkg');
    const now = Date.now();
    let lastNameHash: string | undefined;
    let lastNameSalt: string | undefined;
    let lastNameToken: string | undefined;
    let lastNameTokenNows: string | undefined;

    if (params.last_name) {
      const { hash, salt } = hashSensitive(params.last_name);
      lastNameHash = hash;
      lastNameSalt = salt;
      
      const lnLower = params.last_name.toLowerCase();
      const lnNowhitespace = lnLower.replace(/\s+/g, '');
      lastNameToken = hmacDeterministic(lnLower);
      lastNameTokenNows = hmacDeterministic(lnNowhitespace);
    }

    await this.query(
      `INSERT INTO bookings (id, source, reference, last_name_hash, last_name_salt, 
                           last_name_token, last_name_token_nows, start_date, end_date, 
                           user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, params.source, params.reference, lastNameHash, lastNameSalt,
       lastNameToken, lastNameTokenNows, params.start_date, params.end_date,
       params.user_id, now]
    );

    const booking: Booking = {
      id,
      source: params.source,
      reference: params.reference,
      last_name_hash: lastNameHash,
      last_name_salt: lastNameSalt,
      last_name_token: lastNameToken,
      last_name_token_nows: lastNameTokenNows,
      start_date: params.start_date,
      end_date: params.end_date,
      user_id: params.user_id,
      created_at: now,
    };

    logger.info('Booking created', { bookingId: id, source: params.source, reference: params.reference });
    metrics.counter('bookings_created_total', 1, { source: params.source });

    return booking;
  }

  async findBookingByReferenceAndLastName(reference: string, lastName: string): Promise<Booking | undefined> {
    const lnLower = lastName.toLowerCase();
    const lnNowhitespace = lnLower.replace(/\s+/g, '');
    const lnToken = hmacDeterministic(lnLower);
    const lnTokenNows = hmacDeterministic(lnNowhitespace);

    const result = await this.query(
      `SELECT * FROM bookings 
       WHERE reference = $1 AND (last_name_token = $2 OR last_name_token_nows = $3)
       LIMIT 1`,
      [reference, lnToken, lnTokenNows]
    );

    if (result.rows.length === 0) return undefined;
    return this.rowToBooking(result.rows[0]);
  }

  async findBookingById(id: string): Promise<Booking | undefined> {
    const result = await this.query(
      'SELECT * FROM bookings WHERE id = $1 LIMIT 1',
      [id]
    );

    if (result.rows.length === 0) return undefined;
    return this.rowToBooking(result.rows[0]);
  }

  // Access operations
  async setAccess(userId: string, bookingId: string, status: AccessStatus): Promise<BookingAccess> {
    const now = Date.now();

    const result = await this.query(
      `INSERT INTO booking_access (user_id, booking_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, booking_id)
       DO UPDATE SET status = $3, updated_at = $5
       RETURNING *`,
      [userId, bookingId, status, now, now]
    );

    const access: BookingAccess = {
      user_id: userId,
      booking_id: bookingId,
      status,
      created_at: result.rows[0].created_at,
      updated_at: now,
    };

    logger.info('Booking access set', { userId, bookingId, status });
    metrics.counter('booking_access_set_total', 1, { status });

    return access;
  }

  // Check-in operations
  async upsertCheckinCompletion(bookingId: string, data: { arrival_time: string; special_requests?: string }): Promise<CheckinCompletionRec> {
    const now = Date.now();

    const result = await this.query(
      `INSERT INTO checkin_completions (booking_id, arrival_time, special_requests, accepted_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (booking_id)
       DO UPDATE SET arrival_time = $2, special_requests = $3, accepted_at = $4
       RETURNING *`,
      [bookingId, data.arrival_time, data.special_requests, now]
    );

    const completion: CheckinCompletionRec = {
      booking_id: bookingId,
      arrival_time: data.arrival_time,
      special_requests: data.special_requests,
      accepted_at: now,
    };

    logger.info('Check-in completion upserted', { bookingId, arrivalTime: data.arrival_time });
    metrics.counter('checkin_completions_total', 1);

    return completion;
  }

  async getCheckinCompletionByBooking(bookingId: string): Promise<CheckinCompletionRec | undefined> {
    const result = await this.query(
      'SELECT * FROM checkin_completions WHERE booking_id = $1 LIMIT 1',
      [bookingId]
    );

    if (result.rows.length === 0) return undefined;

    const row = result.rows[0];
    return {
      booking_id: row.booking_id,
      arrival_time: row.arrival_time,
      special_requests: row.special_requests,
      accepted_at: row.accepted_at,
    };
  }

  // Helper methods
  private generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private rowToBooking(row: any): Booking {
    return {
      id: row.id,
      source: row.source,
      reference: row.reference,
      last_name_hash: row.last_name_hash,
      last_name_salt: row.last_name_salt,
      last_name_token: row.last_name_token,
      last_name_token_nows: row.last_name_token_nows,
      start_date: row.start_date,
      end_date: row.end_date,
      user_id: row.user_id,
      created_at: row.created_at,
    };
  }

  // Health check
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const start = Date.now();
      await this.query('SELECT 1');
      const duration = Date.now() - start;

      return {
        healthy: true,
        details: {
          connected: this.isConnected,
          responseTime: duration,
          poolSize: this.pool.totalCount,
          idleConnections: this.pool.idleCount,
          waitingClients: this.pool.waitingCount,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}

// Database factory
export function createDatabase(): PostgreSQLGuestStore {
  const config: DatabaseConfig = {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production',
    maxConnections: 20,
    connectionTimeoutMs: 5000,
    idleTimeoutMs: 30000,
  };

  return new PostgreSQLGuestStore(config);
}

// Singleton instance
let dbInstance: PostgreSQLGuestStore | null = null;

export function getDatabase(): PostgreSQLGuestStore {
  if (!dbInstance) {
    dbInstance = createDatabase();
  }
  return dbInstance;
}