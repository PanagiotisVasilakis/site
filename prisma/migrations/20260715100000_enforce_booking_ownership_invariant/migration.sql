BEGIN;

-- A verified booking must always have a durable owner. Validate existing data
-- before installing the constraint so a previously lossy deployment fails
-- loudly instead of silently accepting an ownerless verified booking.
DO $$
DECLARE
  ownerless_verified_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO ownerless_verified_count
  FROM "bookings"
  WHERE "access_status" = 'VERIFIED'
    AND "user_id" IS NULL;

  IF ownerless_verified_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce booking ownership: % verified bookings have no user_id',
      ownerless_verified_count;
  END IF;
END $$;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_verified_owner_check"
  CHECK ("access_status" <> 'VERIFIED' OR "user_id" IS NOT NULL)
  NOT VALID;

ALTER TABLE "bookings"
  VALIDATE CONSTRAINT "bookings_verified_owner_check";

COMMIT;
