PRAGMA foreign_keys = ON;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Identities (AFM/PASSPORT) stored as salted hashes + last4
CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('AFM','PASSPORT')),
  value_hash TEXT NOT NULL,
  value_last4 TEXT NOT NULL CHECK (length(value_last4) = 4),
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(type, value_hash)
);
CREATE INDEX IF NOT EXISTS idx_identities_type_hash ON identities(type, value_hash);
CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  reference TEXT NOT NULL,
  last_name_hash TEXT NOT NULL,
  last_name_last2 TEXT CHECK (last_name_last2 IS NULL OR length(last_name_last2) = 2),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(source, reference)
);
CREATE INDEX IF NOT EXISTS idx_bookings_lastname ON bookings(last_name_hash);
CREATE INDEX IF NOT EXISTS idx_bookings_source_ref ON bookings(source, reference);

-- Booking Access (link users to bookings with status)
CREATE TABLE IF NOT EXISTS booking_access (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REVOKED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(booking_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_access_booking ON booking_access(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_access_user ON booking_access(user_id);

-- Auth Sessions (guest sessions, optional refresh)
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  refresh_token_hash TEXT,
  expires_at INTEGER NOT NULL CHECK (expires_at > 0),
  created_at INTEGER NOT NULL,
  UNIQUE(refresh_token_hash)
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_booking ON auth_sessions(booking_id);

-- Legacy table removed
