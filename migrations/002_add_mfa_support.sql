-- MFA tables for multi-factor authentication support
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mfa_factors_user_id ON mfa_factors(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_type ON mfa_factors(type);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_status ON mfa_factors(status);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_created_at ON mfa_factors(created_at);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_activated_at ON mfa_factors(activated_at);
CREATE INDEX IF NOT EXISTS idx_mfa_factors_last_used_at ON mfa_factors(last_used_at);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user_id ON mfa_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_factor_id ON mfa_challenges(factor_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires_at ON mfa_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_completed_at ON mfa_challenges(completed_at);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_created_at ON mfa_challenges(created_at);