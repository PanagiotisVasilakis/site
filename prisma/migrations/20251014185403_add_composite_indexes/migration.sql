-- CreateIndex
CREATE INDEX "idx_access_user_status" ON "access"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_bookings_user_dates" ON "bookings"("user_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_bookings_lookup" ON "bookings"("reference", "last_name_token");

-- CreateIndex
CREATE INDEX "idx_bookings_source_created" ON "bookings"("source", "created_at");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_cleanup" ON "refresh_tokens"("expires_at", "revoked_at");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_user_active" ON "refresh_tokens"("user_id", "expires_at", "revoked_at");

-- CreateIndex
CREATE INDEX "idx_users_phone_country" ON "users"("phone_e164", "country_origin");

-- CreateIndex
CREATE INDEX "idx_users_email_password" ON "users"("email", "password_hash");
