-- Create tables for guest data storage
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    phone_e164 TEXT NOT NULL,
    password_hash TEXT,
    country_origin TEXT NOT NULL CHECK(country_origin IN ('GR', 'ABROAD')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS access (
    user_id TEXT NOT NULL,
    booking_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('PENDING', 'VERIFIED')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, booking_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    booking_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checkins (
    booking_id TEXT PRIMARY KEY,
    arrival_time TEXT NOT NULL,
    special_requests TEXT,
    accepted_at INTEGER NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_e164);
CREATE INDEX IF NOT EXISTS idx_users_country_origin ON users(country_origin);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);
CREATE INDEX IF NOT EXISTS idx_identities_type ON identities(type);
CREATE INDEX IF NOT EXISTS idx_identities_verified_at ON identities(verified_at);
CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(reference);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_access_user ON access(user_id);
CREATE INDEX IF NOT EXISTS idx_access_booking ON access(booking_id);
CREATE INDEX IF NOT EXISTS idx_access_status ON access(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_booking ON sessions(booking_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_checkins_booking ON checkins(booking_id);
CREATE INDEX IF NOT EXISTS idx_checkins_accepted_at ON checkins(accepted_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);