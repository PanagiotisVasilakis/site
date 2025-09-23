-- PostgreSQL Database Schema for Guest Portal
-- Production-ready schema with security and performance optimizations

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table with encrypted phone storage
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255),
  phone_enc TEXT NOT NULL, -- AES encrypted phone number
  phone_hmac VARCHAR(64) NOT NULL, -- HMAC for fast lookups
  country_origin VARCHAR(10) NOT NULL CHECK (country_origin IN ('GR', 'ABROAD')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_hmac ON users(phone_hmac);
CREATE INDEX IF NOT EXISTS idx_users_country_origin ON users(country_origin);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Identities table for AFM/Passport storage
CREATE TABLE IF NOT EXISTS identities (
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('AFM', 'PASSPORT')),
  value_hash VARCHAR(64) NOT NULL, -- SHA-256 hash with salt
  salt VARCHAR(32) NOT NULL,
  last4_mask VARCHAR(10) NOT NULL, -- For display purposes
  verified_at BIGINT,
  PRIMARY KEY (user_id, type)
);

-- Indexes for identities
CREATE INDEX IF NOT EXISTS idx_identities_type ON identities(type);
CREATE INDEX IF NOT EXISTS idx_identities_verified_at ON identities(verified_at);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(255) PRIMARY KEY,
  source VARCHAR(20) NOT NULL CHECK (source IN ('ONSITE', 'EXTERNAL')),
  reference VARCHAR(100),
  last_name_hash VARCHAR(64), -- Hashed last name
  last_name_salt VARCHAR(32),
  last_name_token VARCHAR(64), -- HMAC token for lookup (lowercase)
  last_name_token_nows VARCHAR(64), -- HMAC token for lookup (no whitespace)
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL
);

-- Indexes for bookings
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_start_date ON bookings(start_date);
CREATE INDEX IF NOT EXISTS idx_bookings_end_date ON bookings(end_date);
CREATE INDEX IF NOT EXISTS idx_bookings_last_name_token ON bookings(last_name_token) WHERE last_name_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_last_name_token_nows ON bookings(last_name_token_nows) WHERE last_name_token_nows IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_source ON bookings(source);

-- Booking access control
CREATE TABLE IF NOT EXISTS booking_access (
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id VARCHAR(255) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'VERIFIED')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, booking_id)
);

-- Indexes for booking access
CREATE INDEX IF NOT EXISTS idx_booking_access_status ON booking_access(status);
CREATE INDEX IF NOT EXISTS idx_booking_access_created_at ON booking_access(created_at);

-- Auth sessions
CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id VARCHAR(255) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Indexes for auth sessions
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_booking_id ON auth_sessions(booking_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_revoked_at ON auth_sessions(revoked_at) WHERE revoked_at IS NOT NULL;

-- Check-in completions
CREATE TABLE IF NOT EXISTS checkin_completions (
  booking_id VARCHAR(255) PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  arrival_time VARCHAR(5) NOT NULL, -- HH:MM format
  special_requests TEXT,
  accepted_at BIGINT NOT NULL
);

-- Refresh tokens for session management
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  salt VARCHAR(32) NOT NULL,
  family_id VARCHAR(255) NOT NULL, -- For token rotation
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  rotated_from_id VARCHAR(255),
  last_used_at BIGINT,
  device_hint VARCHAR(255),
  ip_hint VARCHAR(45) -- IPv6 compatible
);

-- Indexes for refresh tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- Audit log table for compliance
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255),
  booking_id VARCHAR(255),
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  correlation_id VARCHAR(255),
  timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_correlation_id ON audit_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- Cleanup functions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auth_sessions 
  WHERE expires_at < EXTRACT(EPOCH FROM NOW()) * 1000;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
  cutoff_time BIGINT;
BEGIN
  -- Delete tokens expired more than 30 days ago
  cutoff_time := EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000;
  
  DELETE FROM refresh_tokens 
  WHERE expires_at < cutoff_time;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Security: Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_access ENABLE ROW LEVEL SECURITY;

-- RLS policies (basic examples - customize based on your auth system)
-- These would be configured based on your actual authentication mechanism

-- Performance: Table statistics update
CREATE OR REPLACE FUNCTION update_table_statistics()
RETURNS VOID AS $$
BEGIN
  ANALYZE users;
  ANALYZE identities;
  ANALYZE bookings;
  ANALYZE booking_access;
  ANALYZE auth_sessions;
  ANALYZE checkin_completions;
  ANALYZE refresh_tokens;
  ANALYZE audit_log;
END;
$$ LANGUAGE plpgsql;

-- Views for common queries
CREATE OR REPLACE VIEW active_bookings AS
SELECT 
  b.*,
  u.country_origin,
  ba.status as access_status,
  ba.updated_at as access_updated_at
FROM bookings b
JOIN users u ON b.user_id = u.id
JOIN booking_access ba ON b.id = ba.booking_id
WHERE ba.status = 'VERIFIED'
  AND b.end_date >= CURRENT_DATE;

CREATE OR REPLACE VIEW user_identity_summary AS
SELECT 
  u.id as user_id,
  u.country_origin,
  u.created_at,
  i.type as identity_type,
  i.last4_mask,
  i.verified_at
FROM users u
LEFT JOIN identities i ON u.id = i.user_id;

-- Triggers for audit logging
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    event_type,
    user_id,
    resource_type,
    resource_id,
    action,
    details,
    timestamp
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.user_id, OLD.user_id),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE 
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      ELSE to_jsonb(NEW)
    END,
    EXTRACT(EPOCH FROM NOW()) * 1000
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to key tables
DROP TRIGGER IF EXISTS audit_users ON users;
CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_booking_access ON booking_access;
CREATE TRIGGER audit_booking_access
  AFTER INSERT OR UPDATE OR DELETE ON booking_access
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts with encrypted PII data';
COMMENT ON TABLE identities IS 'User identity documents (AFM/Passport) with hashed values';
COMMENT ON TABLE bookings IS 'Booking records with privacy-preserving search tokens';
COMMENT ON TABLE booking_access IS 'User access permissions for bookings';
COMMENT ON TABLE auth_sessions IS 'Active authentication sessions';
COMMENT ON TABLE checkin_completions IS 'Check-in completion records';
COMMENT ON TABLE refresh_tokens IS 'Refresh tokens for session management';
COMMENT ON TABLE audit_log IS 'Audit trail for compliance and security';

COMMENT ON COLUMN users.phone_enc IS 'AES-256-GCM encrypted phone number';
COMMENT ON COLUMN users.phone_hmac IS 'HMAC-SHA256 for fast phone lookups';
COMMENT ON COLUMN identities.value_hash IS 'SHA-256 hash of AFM/Passport with salt and pepper';
COMMENT ON COLUMN bookings.last_name_token IS 'HMAC token for case-insensitive last name matching';
COMMENT ON COLUMN bookings.last_name_token_nows IS 'HMAC token for whitespace-normalized last name matching';