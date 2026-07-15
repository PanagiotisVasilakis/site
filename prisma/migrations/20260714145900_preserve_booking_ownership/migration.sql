BEGIN;

-- This migration must run before the migration that retires the legacy
-- "access" table. It is deliberately safe to apply out of order on databases
-- where that later migration has already removed the table: in that case the
-- durable booking ownership column is the only remaining source of truth.
DO $$
DECLARE
  ambiguous_booking_count BIGINT;
  conflicting_booking_count BIGINT;
  unpreserved_booking_count BIGINT;
BEGIN
  IF to_regclass('public.access') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $query$
    SELECT COUNT(*)
    FROM (
      SELECT a."booking_id"
      FROM "access" a
      GROUP BY a."booking_id"
      HAVING COUNT(DISTINCT a."user_id") > 1
    ) ambiguous
  $query$ INTO ambiguous_booking_count;

  IF ambiguous_booking_count > 0 THEN
    RAISE EXCEPTION
      'Cannot preserve booking ownership: % bookings have multiple access users',
      ambiguous_booking_count;
  END IF;

  EXECUTE $query$
    SELECT COUNT(*)
    FROM "access" a
    JOIN "bookings" b ON b."id" = a."booking_id"
    WHERE b."user_id" IS NOT NULL
      AND b."user_id" <> a."user_id"
  $query$ INTO conflicting_booking_count;

  IF conflicting_booking_count > 0 THEN
    RAISE EXCEPTION
      'Cannot preserve booking ownership: % access rows conflict with bookings.user_id',
      conflicting_booking_count;
  END IF;

  EXECUTE $query$
    UPDATE "bookings" b
    SET "user_id" = owner_row."user_id"
    FROM (
      SELECT
        a."booking_id",
        MIN(a."user_id"::text)::uuid AS "user_id"
      FROM "access" a
      GROUP BY a."booking_id"
      HAVING COUNT(DISTINCT a."user_id") = 1
    ) owner_row
    WHERE b."id" = owner_row."booking_id"
      AND b."user_id" IS NULL
  $query$;

  EXECUTE $query$
    SELECT COUNT(*)
    FROM "access" a
    JOIN "bookings" b ON b."id" = a."booking_id"
    WHERE b."user_id" IS NULL
      OR b."user_id" <> a."user_id"
  $query$ INTO unpreserved_booking_count;

  IF unpreserved_booking_count > 0 THEN
    RAISE EXCEPTION
      'Booking ownership preservation failed for % access rows',
      unpreserved_booking_count;
  END IF;
END $$;

COMMIT;
