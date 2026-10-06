-- Availability calendar (R3-F05): seasonal nightly prices kept in the admin, and
-- the state of the server-side Airbnb iCal sync (blocked nights only, no guest
-- data). New tables only, so there is no data to migrate. The checks and the
-- exclusion constraint are raw SQL that the Prisma schema cannot express; its
-- model comments name them.
--
-- No explicit BEGIN/COMMIT: PostgreSQL runs this multi-statement script as one
-- implicit transaction.

-- CreateTable
CREATE TABLE "rate_periods" (
    "id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "nightly_price_cents" INTEGER NOT NULL,
    "minimum_nights" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_periods_pkey" PRIMARY KEY ("id"),
    -- end_date is exclusive: the period prices the nights [start_date, end_date).
    CONSTRAINT "rate_periods_dates_check" CHECK ("end_date" > "start_date"),
    CONSTRAINT "rate_periods_length_check" CHECK ("end_date" - "start_date" <= 366),
    CONSTRAINT "rate_periods_price_check" CHECK ("nightly_price_cents" BETWEEN 100 AND 1000000),
    CONSTRAINT "rate_periods_minimum_nights_check" CHECK ("minimum_nights" BETWEEN 1 AND 60),
    -- At most one price per night. A single range expression needs no btree_gist;
    -- a conflicting write fails with SQLSTATE 23P01.
    CONSTRAINT "rate_periods_no_overlap"
      EXCLUDE USING gist (daterange("start_date", "end_date", '[)') WITH &&)
);

-- CreateTable
CREATE TABLE "calendar_sync_state" (
    "id" VARCHAR(16) NOT NULL,
    "blocked_nights" DATE[] NOT NULL DEFAULT ARRAY[]::DATE[],
    "horizon_start" DATE,
    "horizon_end" DATE,
    "last_success_at" TIMESTAMPTZ(6),
    "last_attempt_at" TIMESTAMPTZ(6),
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_failure_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(32),
    "last_http_status" SMALLINT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "lease_owner" VARCHAR(128),
    "lease_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_sync_state_pkey" PRIMARY KEY ("id"),
    -- A single sync source: the row seeded below is the only one allowed.
    CONSTRAINT "calendar_sync_state_singleton_check" CHECK ("id" = 'airbnb'),
    CONSTRAINT "calendar_sync_state_blocked_nights_check" CHECK (cardinality("blocked_nights") <= 400),
    CONSTRAINT "calendar_sync_state_horizon_check" CHECK (
      ("horizon_start" IS NULL AND "horizon_end" IS NULL)
      OR ("horizon_start" IS NOT NULL AND "horizon_end" IS NOT NULL AND "horizon_end" > "horizon_start")
    ),
    CONSTRAINT "calendar_sync_state_last_error_code_check" CHECK ("last_error_code" ~ '^[a-z_]{1,32}$'),
    CONSTRAINT "calendar_sync_state_last_http_status_check" CHECK ("last_http_status" BETWEEN 100 AND 599),
    CONSTRAINT "calendar_sync_state_consecutive_failures_check" CHECK ("consecutive_failures" >= 0),
    CONSTRAINT "calendar_sync_state_lease_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL))
);

-- Seed the singleton here, so the sync only ever updates it (no upsert race).
INSERT INTO "calendar_sync_state" ("id") VALUES ('airbnb');
