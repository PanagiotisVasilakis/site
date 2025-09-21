PRAGMA foreign_keys = ON;

-- Drop any legacy OTP/CAPTCHA-related artifacts if they exist (defensive cleanup)
DROP TABLE IF EXISTS otp_codes;
DROP TABLE IF EXISTS otp_attempts;
DROP INDEX IF EXISTS idx_otp_codes_phone;
DROP INDEX IF EXISTS idx_otp_attempts_phone;

-- If an otp_settings or captcha_settings table existed
DROP TABLE IF EXISTS otp_settings;
DROP TABLE IF EXISTS captcha_settings;
