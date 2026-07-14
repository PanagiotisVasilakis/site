BEGIN;

-- Refuse ambiguous or lossy upgrades. Operators receive counts from the
-- separate read-only preflight command before this migration is attempted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "access"
    GROUP BY "booking_id"
    HAVING COUNT(DISTINCT "user_id") > 1
  ) THEN
    RAISE EXCEPTION 'Cannot migrate booking ownership: a booking has multiple access users';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "access" a
    JOIN "bookings" b ON b."id" = a."booking_id"
    WHERE b."user_id" IS NOT NULL AND b."user_id" <> a."user_id"
  ) THEN
    RAISE EXCEPTION 'Cannot migrate booking ownership: access user differs from booking user';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "bookings"
    WHERE "reference" IS NOT NULL
    GROUP BY "source", "reference"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce provider reference uniqueness: duplicates exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE "phone_e164" !~ '^\+[1-9][0-9]{7,14}$'
  ) THEN
    RAISE EXCEPTION 'Cannot enforce E.164 phone constraint: invalid values exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "refresh_tokens"
    GROUP BY "family_id"
    HAVING COUNT(DISTINCT "user_id") > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create refresh families: a family belongs to multiple users';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "check_in_requests"
    WHERE "booking_id" IS NOT NULL AND "status" = 'PENDING'
    GROUP BY "booking_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one pending check-in request per booking';
  END IF;
END $$;

ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_e164_check"
  CHECK ("phone_e164" ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE "bookings"
  ADD COLUMN "provider" VARCHAR(32) NOT NULL DEFAULT 'legacy',
  ADD COLUMN "external_reference" VARCHAR(128),
  ADD COLUMN "access_status" "AccessStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "claimed_at" TIMESTAMPTZ(6);

UPDATE "bookings" b
SET
  "provider" = lower(b."source"::text),
  "external_reference" = b."reference",
  "access_status" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "access" a
      WHERE a."booking_id" = b."id" AND a."status" = 'VERIFIED'
    ) THEN 'VERIFIED'::"AccessStatus"
    ELSE 'PENDING'::"AccessStatus"
  END,
  "claimed_at" = (
    SELECT min(a."updated_at") FROM "access" a WHERE a."booking_id" = b."id"
  );

CREATE UNIQUE INDEX "bookings_provider_external_reference_key"
  ON "bookings"("provider", "external_reference");
CREATE INDEX "idx_bookings_access_window"
  ON "bookings"("access_status", "start_date", "end_date");

CREATE TYPE "ClaimChannel" AS ENUM ('REMOTE', 'ONSITE');

CREATE TABLE "booking_claim_grants" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "token_digest" CHAR(64) NOT NULL,
  "channel" "ClaimChannel" NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "issued_by_admin_session_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_claim_grants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "booking_claim_grants_token_digest_key" ON "booking_claim_grants"("token_digest");
CREATE INDEX "idx_claim_grants_booking_expiry" ON "booking_claim_grants"("booking_id", "expires_at");
CREATE INDEX "idx_claim_grants_cleanup" ON "booking_claim_grants"("expires_at", "consumed_at", "revoked_at");
ALTER TABLE "booking_claim_grants" ADD CONSTRAINT "booking_claim_grants_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_claim_grants" ADD CONSTRAINT "booking_claim_grants_admin_session_fkey"
  FOREIGN KEY ("issued_by_admin_session_id") REFERENCES "admin_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "refresh_token_families" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" UUID NOT NULL,
  "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "revocation_reason" VARCHAR(128),
  "device_hash" CHAR(64),
  "ip_hash" CHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_token_families_pkey" PRIMARY KEY ("id")
);

INSERT INTO "refresh_token_families" (
  "id", "user_id", "absolute_expires_at", "revoked_at", "created_at"
)
SELECT
  "family_id",
  min("user_id"::text)::uuid,
  LEAST(max("expires_at"), min("created_at") + INTERVAL '30 days'),
  CASE WHEN bool_and("revoked_at" IS NOT NULL) THEN max("revoked_at") ELSE NULL END,
  min("created_at")
FROM "refresh_tokens"
GROUP BY "family_id";

UPDATE "refresh_tokens" t
SET "expires_at" = LEAST(t."expires_at", f."absolute_expires_at")
FROM "refresh_token_families" f
WHERE f."id" = t."family_id";

ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" TYPE VARCHAR(64);
ALTER TABLE "refresh_token_families" ADD CONSTRAINT "refresh_token_families_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_family_id_fkey"
  FOREIGN KEY ("family_id") REFERENCES "refresh_token_families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "idx_refresh_families_user_expiry" ON "refresh_token_families"("user_id", "absolute_expires_at");
CREATE INDEX "idx_refresh_families_revoked" ON "refresh_token_families"("revoked_at");

ALTER TYPE "OutboxStatus" RENAME VALUE 'PROCESSING' TO 'LEASED';
ALTER TYPE "OutboxStatus" RENAME VALUE 'FAILED' TO 'DEAD';
ALTER TABLE "webhook_outbox" RENAME TO "outbox_events";
ALTER TABLE "outbox_events"
  ADD COLUMN "destination" VARCHAR(64),
  ADD COLUMN "aggregate_type" VARCHAR(64),
  ADD COLUMN "aggregate_id" VARCHAR(128),
  ADD COLUMN "idempotency_key" VARCHAR(191),
  ADD COLUMN "lease_owner" VARCHAR(128),
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ(6),
  ALTER COLUMN "stay_request_id" DROP NOT NULL,
  ALTER COLUMN "event_type" TYPE VARCHAR(96),
  ALTER COLUMN "last_error" TYPE VARCHAR(2048);

UPDATE "outbox_events"
SET
  "destination" = 'booking_request_webhook',
  "aggregate_type" = 'stay_request',
  "aggregate_id" = "stay_request_id"::text,
  "idempotency_key" = 'legacy:' || "id"::text;

ALTER TABLE "outbox_events"
  ALTER COLUMN "destination" SET NOT NULL,
  ALTER COLUMN "aggregate_type" SET NOT NULL,
  ALTER COLUMN "aggregate_id" SET NOT NULL,
  ALTER COLUMN "idempotency_key" SET NOT NULL;

DROP INDEX "idx_webhook_outbox_delivery";
DROP INDEX "idx_webhook_outbox_stay_request";
ALTER TABLE "outbox_events" DROP CONSTRAINT "webhook_outbox_stay_request_id_fkey";
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_stay_request_id_fkey"
  FOREIGN KEY ("stay_request_id") REFERENCES "stay_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbox_events" ADD COLUMN "check_in_request_id" UUID;
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_check_in_request_id_fkey"
  FOREIGN KEY ("check_in_request_id") REFERENCES "check_in_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "outbox_events_idempotency_key" ON "outbox_events"("idempotency_key");
CREATE INDEX "idx_outbox_events_delivery" ON "outbox_events"("status", "next_attempt_at");
CREATE INDEX "idx_outbox_events_lease" ON "outbox_events"("lease_expires_at");
CREATE INDEX "idx_outbox_events_aggregate" ON "outbox_events"("aggregate_type", "aggregate_id");
CREATE INDEX "idx_outbox_events_check_in_request" ON "outbox_events"("check_in_request_id");

CREATE TABLE "terms_acceptances" (
  "id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "terms_version" VARCHAR(64) NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "terms_acceptances_booking_user_version_key"
  ON "terms_acceptances"("booking_id", "user_id", "terms_version");
CREATE INDEX "idx_terms_acceptances_accepted_at" ON "terms_acceptances"("accepted_at");
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "security_audit_events" (
  "id" UUID NOT NULL,
  "event_type" VARCHAR(96) NOT NULL,
  "severity" VARCHAR(16) NOT NULL,
  "correlation_id" VARCHAR(128),
  "ip_hash" CHAR(64),
  "path" VARCHAR(512),
  "details" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "security_audit_events_severity_check" CHECK ("severity" IN ('low', 'medium', 'high', 'critical'))
);
CREATE INDEX "idx_security_events_type_time" ON "security_audit_events"("event_type", "occurred_at");
CREATE INDEX "idx_security_events_severity_time" ON "security_audit_events"("severity", "occurred_at");

CREATE TABLE "alert_rules" (
  "id" UUID NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "description" VARCHAR(512) NOT NULL,
  "metric_name" VARCHAR(128) NOT NULL,
  "comparison" VARCHAR(8) NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "window_minutes" INTEGER NOT NULL,
  "severity" VARCHAR(16) NOT NULL DEFAULT 'medium',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alert_rules_comparison_check" CHECK ("comparison" IN ('gt', 'gte', 'lt', 'lte')),
  CONSTRAINT "alert_rules_severity_check" CHECK ("severity" IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT "alert_rules_window_check" CHECK ("window_minutes" > 0)
);
CREATE UNIQUE INDEX "alert_rules_name_key" ON "alert_rules"("name");
CREATE INDEX "idx_alert_rules_enabled" ON "alert_rules"("enabled");

CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TABLE "alerts" (
  "id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
  "value" DOUBLE PRECISION NOT NULL,
  "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMPTZ(6),
  "resolved_at" TIMESTAMPTZ(6),
  "notification_delivered_at" TIMESTAMPTZ(6),
  "notification_attempts" INTEGER NOT NULL DEFAULT 0,
  "notification_last_error" VARCHAR(1024),
  CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "alert_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "idx_alerts_status_opened" ON "alerts"("status", "opened_at");
CREATE UNIQUE INDEX "alerts_one_unresolved_per_rule"
  ON "alerts"("rule_id") WHERE "status" IN ('OPEN', 'ACKNOWLEDGED');

CREATE TABLE "analytics_hits" (
  "id" UUID NOT NULL,
  "path" VARCHAR(512) NOT NULL,
  "locale" VARCHAR(8),
  "event_name" VARCHAR(96),
  "properties" JSONB,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_hits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_analytics_hits_occurred" ON "analytics_hits"("occurred_at");
CREATE INDEX "idx_analytics_hits_path_time" ON "analytics_hits"("path", "occurred_at");

CREATE TABLE "analytics_vitals" (
  "id" UUID NOT NULL,
  "name" VARCHAR(16) NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "path" VARCHAR(512) NOT NULL,
  "metric_id" VARCHAR(128),
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_vitals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_analytics_vitals_occurred" ON "analytics_vitals"("occurred_at");
CREATE INDEX "idx_analytics_vitals_name_time" ON "analytics_vitals"("name", "occurred_at");

CREATE TYPE "PrivacyRequestType" AS ENUM ('EXPORT', 'ERASURE');
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('PENDING', 'VERIFIED', 'COMPLETED', 'REJECTED');
CREATE TABLE "privacy_requests" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "booking_id" UUID,
  "subject_digest" CHAR(64) NOT NULL,
  "request_type" "PrivacyRequestType" NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  "audit_note" VARCHAR(1024),
  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "idx_privacy_requests_status_time" ON "privacy_requests"("status", "requested_at");
CREATE INDEX "idx_privacy_requests_subject_time" ON "privacy_requests"("subject_digest", "requested_at");

CREATE TABLE "privacy_holds" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "booking_id" UUID,
  "reason" VARCHAR(512) NOT NULL,
  "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMPTZ(6),
  CONSTRAINT "privacy_holds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "privacy_holds_subject_check" CHECK (("user_id" IS NOT NULL)::int + ("booking_id" IS NOT NULL)::int = 1)
);
ALTER TABLE "privacy_holds" ADD CONSTRAINT "privacy_holds_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "privacy_holds" ADD CONSTRAINT "privacy_holds_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "idx_privacy_holds_user" ON "privacy_holds"("user_id", "released_at");
CREATE INDEX "idx_privacy_holds_booking" ON "privacy_holds"("booking_id", "released_at");

CREATE UNIQUE INDEX "check_in_requests_one_pending_per_booking"
  ON "check_in_requests"("booking_id")
  WHERE "booking_id" IS NOT NULL AND "status" = 'PENDING';

-- Identity hashes and duplicate access state are deliberately retired after
-- their ownership state has been copied into bookings.
DROP TABLE "identities";
DROP TYPE "IdentityType";
DROP TABLE "access";
DROP TABLE "onsite_grants";

-- Surname-derived hashes/tokens were only needed by the retired public
-- reservation lookup. Retaining them would provide no product value.
DROP INDEX IF EXISTS "idx_bookings_lookup";
ALTER TABLE "bookings"
  DROP COLUMN "last_name_hash",
  DROP COLUMN "last_name_salt",
  DROP COLUMN "last_name_token",
  DROP COLUMN "last_name_token_nows";

COMMIT;
