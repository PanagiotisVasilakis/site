#!/usr/bin/env node

import { initializeDatabase, getDatabase } from '../src/lib/database.js';

async function runMigrations() {
  try {
    // Initialize database
    await initializeDatabase();
    const db = await getDatabase();
    
    // Create all tables in correct order
    await db.exec(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT,
          phone_e164 TEXT NOT NULL,
          password_hash TEXT,
          country_origin TEXT NOT NULL CHECK(country_origin IN ('GR', 'ABROAD')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
      );

      -- Identities table
      CREATE TABLE IF NOT EXISTS identities (
          user_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('AFM', 'PASSPORT')),
          value_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          last4_mask TEXT NOT NULL,
          verified_at INTEGER,
          PRIMARY KEY (user_id, type),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Bookings table
      CREATE TABLE IF NOT EXISTS bookings (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL CHECK(source IN ('ONSITE', 'EXTERNAL')),
          reference TEXT,
          last_name_hash TEXT,
          last_name_salt TEXT,
          last_name_token TEXT,
          last_name_token_nows TEXT,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          user_id TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      -- Booking access table
      CREATE TABLE IF NOT EXISTS booking_access (
          user_id TEXT NOT NULL,
          booking_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('PENDING', 'VERIFIED')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, booking_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
      );

      -- Auth sessions table
      CREATE TABLE IF NOT EXISTS auth_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          booking_id TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          revoked_at INTEGER,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
      );

      -- Checkin completions table
      CREATE TABLE IF NOT EXISTS checkin_completions (
          booking_id TEXT PRIMARY KEY,
          arrival_time TEXT NOT NULL,
          special_requests TEXT,
          accepted_at INTEGER NOT NULL,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
      );

      -- Refresh tokens table
      CREATE TABLE IF NOT EXISTS refresh_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          family_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          revoked_at INTEGER,
          rotated_from_id TEXT,
          last_used_at INTEGER,
          device_hint TEXT,
          ip_hint TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (rotated_from_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL
      );

      -- MFA factors table
      CREATE TABLE IF NOT EXISTS mfa_factors (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('TOTP', 'SMS', 'EMAIL', 'BACKUP_CODE')),
          secret_hash TEXT NOT NULL,
          secret_salt TEXT NOT NULL,
          backup_codes_hash TEXT,
          backup_codes_salt TEXT,
          phone_number_enc TEXT,
          email_enc TEXT,
          status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'INACTIVE', 'PENDING')),
          created_at INTEGER NOT NULL,
          activated_at INTEGER,
          last_used_at INTEGER,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- MFA challenges table
      CREATE TABLE IF NOT EXISTS mfa_challenges (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          factor_id TEXT NOT NULL,
          challenge_code_hash TEXT NOT NULL,
          challenge_code_salt TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          completed_at INTEGER,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (factor_id) REFERENCES mfa_factors(id) ON DELETE CASCADE
      );

      -- Rate limits table
      CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          reset_time INTEGER NOT NULL
      );

      -- Cache table
      CREATE TABLE IF NOT EXISTS cache (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          expires_at INTEGER NOT NULL
      );

      -- Metrics table
      CREATE TABLE IF NOT EXISTS metrics (
          id TEXT PRIMARY KEY,
          metric_name TEXT NOT NULL,
          value REAL NOT NULL,
          tags TEXT NOT NULL,
          recorded_at INTEGER NOT NULL
      );

      -- Logs table
      CREATE TABLE IF NOT EXISTS logs (
          id TEXT PRIMARY KEY,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          meta TEXT NOT NULL,
          timestamp INTEGER NOT NULL
      );
    `);
    
    // Create indexes for better query performance
    await db.exec(`
      -- Users indexes
      CREATE INDEX IF NOT EXISTS idx_users_phone_e164 ON users(phone_e164);
      CREATE INDEX IF NOT EXISTS idx_users_country_origin ON users(country_origin);
      CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
      CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);
      
      -- Identities indexes
      CREATE INDEX IF NOT EXISTS idx_identities_type ON identities(type);
      CREATE INDEX IF NOT EXISTS idx_identities_verified_at ON identities(verified_at);
      
      -- Bookings indexes
      CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(reference);
      CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_bookings_last_name_token ON bookings(last_name_token) WHERE last_name_token IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_bookings_last_name_token_nows ON bookings(last_name_token_nows) WHERE last_name_token_nows IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_bookings_source ON bookings(source);
      
      -- Booking access indexes
      CREATE INDEX IF NOT EXISTS idx_booking_access_status ON booking_access(status);
      CREATE INDEX IF NOT EXISTS idx_booking_access_created_at ON booking_access(created_at);
      CREATE INDEX IF NOT EXISTS idx_booking_access_user_id ON booking_access(user_id);
      CREATE INDEX IF NOT EXISTS idx_booking_access_booking_id ON booking_access(booking_id);
      
      -- Auth sessions indexes
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_booking_id ON auth_sessions(booking_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_revoked_at ON auth_sessions(revoked_at) WHERE revoked_at IS NOT NULL;
      
      -- Refresh tokens indexes
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at) WHERE revoked_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
      
      -- MFA factors indexes
      CREATE INDEX IF NOT EXISTS idx_mfa_factors_user_id ON mfa_factors(user_id);
      CREATE INDEX IF NOT EXISTS idx_mfa_factors_type ON mfa_factors(type);
      CREATE INDEX IF NOT EXISTS idx_mfa_factors_status ON mfa_factors(status);
      CREATE INDEX IF NOT EXISTS idx_mfa_factors_created_at ON mfa_factors(created_at);
      CREATE INDEX IF NOT EXISTS idx_mfa_factors_activated_at ON mfa_factors(activated_at);
      CREATE INDEX IF NOT EXISTS idx_mfa_factors_last_used_at ON mfa_factors(last_used_at);
      
      -- MFA challenges indexes
      CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user_id ON mfa_challenges(user_id);
      CREATE INDEX IF NOT EXISTS idx_mfa_challenges_factor_id ON mfa_challenges(factor_id);
      CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires_at ON mfa_challenges(expires_at);
      CREATE INDEX IF NOT EXISTS idx_mfa_challenges_completed_at ON mfa_challenges(completed_at);
      CREATE INDEX IF NOT EXISTS idx_mfa_challenges_created_at ON mfa_challenges(created_at);
      
      -- Rate limits indexes
      CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_time ON rate_limits(reset_time);
      
      -- Cache indexes
      CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);
      
      -- Metrics indexes
      CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
      CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON metrics(recorded_at);
      
      -- Logs indexes
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
    `);
    
    console.log('Database schema initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();