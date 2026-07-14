-- Fail before applying constraints when existing data cannot be migrated safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "check_in_requests" cir
    LEFT JOIN "bookings" b ON b."id" = cir."booking_id"
    WHERE cir."booking_id" IS NOT NULL AND b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add check_in_requests booking FK: orphan booking_id values exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "check_in_requests" cir
    LEFT JOIN "users" u ON u."id" = cir."user_id"
    WHERE cir."user_id" IS NOT NULL AND u."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add check_in_requests user FK: orphan user_id values exist';
  END IF;
END $$;

-- Normalize phone identifiers before making them unique. Any invalid or duplicate
-- value aborts the migration so an operator can merge records deliberately.
UPDATE "users"
SET "phone_e164" = CASE
  WHEN regexp_replace("phone_e164", '[\s\-()]', '', 'g') ~ '^\+[1-9][0-9]{7,14}$'
    THEN regexp_replace("phone_e164", '[\s\-()]', '', 'g')
  WHEN "country_origin" = 'GR'
    AND regexp_replace("phone_e164", '[\s\-()]', '', 'g') ~ '^[0-9]{10}$'
    THEN '+30' || regexp_replace("phone_e164", '[\s\-()]', '', 'g')
  WHEN regexp_replace("phone_e164", '[\s\-()]', '', 'g') ~ '^[1-9][0-9]{7,14}$'
    THEN '+' || regexp_replace("phone_e164", '[\s\-()]', '', 'g')
  ELSE "phone_e164"
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE "phone_e164" !~ '^\+[1-9][0-9]{7,14}$'
  ) THEN
    RAISE EXCEPTION 'Cannot enforce E.164 phone constraint: invalid phone values exist';
  END IF;

  IF EXISTS (
    SELECT "phone_e164"
    FROM "users"
    GROUP BY "phone_e164"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique phone constraint: duplicate normalized phone values exist';
  END IF;
END $$;

DROP INDEX IF EXISTS "idx_users_phone";
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

ALTER TABLE "check_in_requests"
  ADD CONSTRAINT "check_in_requests_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "check_in_requests"
  ADD CONSTRAINT "check_in_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "onsite_grants" (
  "jti" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onsite_grants_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "idx_onsite_grants_booking" ON "onsite_grants"("booking_id");
CREATE INDEX "idx_onsite_grants_expires" ON "onsite_grants"("expires_at");
ALTER TABLE "onsite_grants" ADD CONSTRAINT "onsite_grants_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "StayRequestStatus" AS ENUM ('PENDING', 'DELIVERED', 'DELIVERY_FAILED', 'CLOSED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');

CREATE TABLE "stay_requests" (
  "id" UUID NOT NULL,
  "property_name" TEXT NOT NULL,
  "locale" VARCHAR(8) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" VARCHAR(32) NOT NULL,
  "arrival_time" TEXT,
  "special_requests" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "status" "StayRequestStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stay_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stay_requests_dates_check" CHECK ("end_date" > "start_date")
);

CREATE UNIQUE INDEX "stay_requests_idempotency_key" ON "stay_requests"("idempotency_key");
CREATE INDEX "idx_stay_requests_status_created" ON "stay_requests"("status", "created_at");
CREATE INDEX "idx_stay_requests_email" ON "stay_requests"("email");

CREATE TABLE "webhook_outbox" (
  "id" UUID NOT NULL,
  "stay_request_id" UUID NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "delivered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_webhook_outbox_delivery" ON "webhook_outbox"("status", "next_attempt_at");
CREATE INDEX "idx_webhook_outbox_stay_request" ON "webhook_outbox"("stay_request_id");
ALTER TABLE "webhook_outbox" ADD CONSTRAINT "webhook_outbox_stay_request_id_fkey"
  FOREIGN KEY ("stay_request_id") REFERENCES "stay_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "operational_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "operational_settings_pkey" PRIMARY KEY ("key")
);

-- Preserve the currently shipped feature availability while moving it to
-- shared state. Operators can disable either feature through the admin UI.
INSERT INTO "operational_settings" ("key", "value", "updated_at") VALUES
  ('feature_flags', '{"portalEnabled":true,"checkinEnabled":true}'::jsonb, CURRENT_TIMESTAMP),
  ('checkin_preferences', '{"checkInTime":"15:00","checkOutTime":"11:00","updatedAt":0}'::jsonb, CURRENT_TIMESTAMP);

CREATE TABLE "admin_sessions" (
  "id" UUID NOT NULL,
  "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_admin_sessions_expires" ON "admin_sessions"("expires_at");
CREATE INDEX "idx_admin_sessions_absolute_expires" ON "admin_sessions"("absolute_expires_at");
