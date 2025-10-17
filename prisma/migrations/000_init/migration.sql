-- CreateEnum
CREATE TYPE "CountryOrigin" AS ENUM ('GR', 'ABROAD');

-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('AFM', 'PASSPORT');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('ONSITE', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('PENDING', 'VERIFIED');

-- CreateEnum
CREATE TYPE "MfaFactorType" AS ENUM ('TOTP', 'SMS', 'EMAIL', 'BACKUP_CODE');

-- CreateEnum
CREATE TYPE "MfaFactorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone_e164" VARCHAR(32) NOT NULL,
    "password_hash" TEXT,
    "country_origin" "CountryOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identities" (
    "user_id" UUID NOT NULL,
    "type" "IdentityType" NOT NULL,
    "value_hash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "last4_mask" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(6),

    CONSTRAINT "identities_pkey" PRIMARY KEY ("user_id","type")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "source" "BookingSource" NOT NULL,
    "reference" TEXT,
    "last_name_hash" TEXT,
    "last_name_salt" TEXT,
    "last_name_token" TEXT,
    "last_name_token_nows" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access" (
    "user_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "status" "AccessStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "access_pkey" PRIMARY KEY ("user_id","booking_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins" (
    "booking_id" UUID NOT NULL,
    "arrival_time" TEXT NOT NULL,
    "special_requests" TEXT,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "rotated_from_id" UUID,
    "last_used_at" TIMESTAMPTZ(6),
    "device_hint" TEXT,
    "ip_hint" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "MfaFactorType" NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "secret_salt" TEXT NOT NULL,
    "backup_codes_hash" TEXT,
    "backup_codes_salt" TEXT,
    "phone_number_enc" TEXT,
    "email_enc" TEXT,
    "status" "MfaFactorStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "factor_id" UUID NOT NULL,
    "challenge_code_hash" TEXT NOT NULL,
    "challenge_code_salt" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "reset_time" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "cache" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" UUID NOT NULL,
    "metric_name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "tags" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" UUID NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_phone" ON "users"("phone_e164");

-- CreateIndex
CREATE INDEX "idx_users_country_origin" ON "users"("country_origin");

-- CreateIndex
CREATE INDEX "idx_users_created_at" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "idx_users_updated_at" ON "users"("updated_at");

-- CreateIndex
CREATE INDEX "idx_identities_type" ON "identities"("type");

-- CreateIndex
CREATE INDEX "idx_identities_verified_at" ON "identities"("verified_at");

-- CreateIndex
CREATE INDEX "idx_bookings_reference" ON "bookings"("reference");

-- CreateIndex
CREATE INDEX "idx_bookings_user" ON "bookings"("user_id");

-- CreateIndex
CREATE INDEX "idx_bookings_dates" ON "bookings"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_access_user" ON "access"("user_id");

-- CreateIndex
CREATE INDEX "idx_access_booking" ON "access"("booking_id");

-- CreateIndex
CREATE INDEX "idx_access_status" ON "access"("status");

-- CreateIndex
CREATE INDEX "idx_sessions_user" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_sessions_booking" ON "sessions"("booking_id");

-- CreateIndex
CREATE INDEX "idx_sessions_expires" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_checkins_booking" ON "checkins"("booking_id");

-- CreateIndex
CREATE INDEX "idx_checkins_accepted_at" ON "checkins"("accepted_at");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_family" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_expires" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_revoked" ON "refresh_tokens"("revoked_at");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_token_hash" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_mfa_factors_user_id" ON "mfa_factors"("user_id");

-- CreateIndex
CREATE INDEX "idx_mfa_factors_type" ON "mfa_factors"("type");

-- CreateIndex
CREATE INDEX "idx_mfa_factors_status" ON "mfa_factors"("status");

-- CreateIndex
CREATE INDEX "idx_mfa_factors_created_at" ON "mfa_factors"("created_at");

-- CreateIndex
CREATE INDEX "idx_mfa_factors_activated_at" ON "mfa_factors"("activated_at");

-- CreateIndex
CREATE INDEX "idx_mfa_factors_last_used_at" ON "mfa_factors"("last_used_at");

-- CreateIndex
CREATE INDEX "idx_mfa_challenges_user_id" ON "mfa_challenges"("user_id");

-- CreateIndex
CREATE INDEX "idx_mfa_challenges_factor_id" ON "mfa_challenges"("factor_id");

-- CreateIndex
CREATE INDEX "idx_mfa_challenges_expires_at" ON "mfa_challenges"("expires_at");

-- CreateIndex
CREATE INDEX "idx_mfa_challenges_completed_at" ON "mfa_challenges"("completed_at");

-- CreateIndex
CREATE INDEX "idx_mfa_challenges_created_at" ON "mfa_challenges"("created_at");

-- CreateIndex
CREATE INDEX "idx_rate_limits_reset_time" ON "rate_limits"("reset_time");

-- CreateIndex
CREATE INDEX "idx_rate_limits_count" ON "rate_limits"("count");

-- CreateIndex
CREATE INDEX "idx_cache_expires_at" ON "cache"("expires_at");

-- CreateIndex
CREATE INDEX "idx_cache_key" ON "cache"("key");

-- CreateIndex
CREATE INDEX "idx_metrics_name" ON "metrics"("metric_name");

-- CreateIndex
CREATE INDEX "idx_metrics_recorded_at" ON "metrics"("recorded_at");

-- CreateIndex
CREATE INDEX "idx_logs_level" ON "logs"("level");

-- CreateIndex
CREATE INDEX "idx_logs_timestamp" ON "logs"("timestamp");

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access" ADD CONSTRAINT "access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access" ADD CONSTRAINT "access_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_rotated_from_id_fkey" FOREIGN KEY ("rotated_from_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "mfa_factors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

