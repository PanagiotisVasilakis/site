\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

DO $$
DECLARE
  failure_count BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "_prisma_migrations"
    WHERE migration_name = '20260715110000_remove_unused_legacy_models'
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Latest required migration is not applied';
  END IF;

  SELECT count(*) INTO failure_count
  FROM "bookings"
  WHERE "access_status" = 'VERIFIED'
    AND "user_id" IS NULL;
  IF failure_count > 0 THEN
    RAISE EXCEPTION '% verified bookings have no durable owner', failure_count;
  END IF;

  SELECT count(*) INTO failure_count
  FROM (
    SELECT "event_id"
    FROM "analytics_hits"
    WHERE "event_id" IS NOT NULL
    GROUP BY "event_id"
    HAVING count(*) > 1
  ) duplicates;
  IF failure_count > 0 THEN
    RAISE EXCEPTION '% duplicate analytics event IDs remain', failure_count;
  END IF;

  SELECT count(*) INTO failure_count
  FROM (
    SELECT "user_id"
    FROM "privacy_requests"
    WHERE "user_id" IS NOT NULL
      AND "request_type" = 'ERASURE'
      AND "status" IN ('PENDING', 'VERIFIED')
    GROUP BY "user_id"
    HAVING count(*) > 1
  ) duplicates;
  IF failure_count > 0 THEN
    RAISE EXCEPTION '% users have multiple open erasure requests', failure_count;
  END IF;

  SELECT count(*) INTO failure_count
  FROM "outbox_events"
  WHERE "status" = 'LEASED'
    AND ("lease_owner" IS NULL OR "lease_expires_at" IS NULL);
  IF failure_count > 0 THEN
    RAISE EXCEPTION '% incomplete outbox leases remain', failure_count;
  END IF;

  IF to_regclass('public.mfa_challenges') IS NOT NULL
    OR to_regclass('public.mfa_factors') IS NOT NULL
    OR to_regclass('public.cache') IS NOT NULL THEN
    RAISE EXCEPTION 'One or more retired legacy tables still exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_verified_owner_check'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'Verified-booking ownership constraint is missing or unvalidated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'stay_requests_phone_e164_enforcement'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Stay-request E.164 enforcement trigger is missing';
  END IF;
END $$;

COMMIT;

SELECT 'post-migration verification passed' AS result;
