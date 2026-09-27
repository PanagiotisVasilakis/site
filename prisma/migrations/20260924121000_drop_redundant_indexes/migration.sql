BEGIN;

-- R-039: each index is already provided by a primary key, a unique constraint
-- or a longer index with the same leading columns, so it only costs writes.
DROP INDEX "idx_bookings_user";               -- idx_bookings_user_dates (user_id, start_date, end_date)
DROP INDEX "idx_checkins_booking";            -- checkins primary key (booking_id)
DROP INDEX "idx_refresh_tokens_user";         -- idx_refresh_tokens_user_active (user_id, expires_at, revoked_at)
DROP INDEX "idx_refresh_tokens_expires";      -- idx_refresh_tokens_cleanup (expires_at, revoked_at)
DROP INDEX "idx_users_phone_country";         -- users_phone_e164_key (unique phone_e164)
DROP INDEX "idx_users_email_password";        -- users_email_key (unique email); it also copied password hashes into an index

COMMIT;
