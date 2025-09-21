PRAGMA foreign_keys = ON;

-- Recreate minimal stub structures to allow down migration to succeed safely
CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone);

CREATE TABLE IF NOT EXISTS otp_attempts (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  attempt_at INTEGER NOT NULL,
  success INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_otp_attempts_phone ON otp_attempts(phone);

-- Settings tables are recreated as empty stubs if needed
CREATE TABLE IF NOT EXISTS otp_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS captcha_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
