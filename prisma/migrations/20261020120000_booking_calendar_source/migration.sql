-- One calendar source: Booking.com (owner decision of 2026-10-20). The availability calendar is fed by the
-- Booking.com iCal export (BOOKING_ICAL_URL), so the single calendar_sync_state row changes its id from
-- 'airbnb' to 'booking' and its singleton CHECK follows. The row holds the snapshot of the previous source
-- (blocked nights, horizon, last success, failure history, lease). Nights from another feed must never be
-- shown as Booking.com data, so the row is reset to what a freshly seeded row holds and the next successful
-- sync fills it (dates and error codes only, no guest data).
--
-- Never guess: the script stops (RAISE EXCEPTION) when a row has any other id or when both rows exist. The
-- old CHECK makes both impossible, so only a hand-edited database can trip a guard. Re-running on a migrated
-- database changes nothing, and a missing row is re-seeded.
--
-- No explicit BEGIN/COMMIT: PostgreSQL runs this multi-statement script as one implicit transaction and
-- stops at a guard, so Prisma reports the refusal itself.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "calendar_sync_state" WHERE "id" NOT IN ('airbnb', 'booking')) THEN
    RAISE EXCEPTION 'Refusing to re-key calendar_sync_state: a row has an id other than airbnb or booking';
  END IF;
  IF EXISTS (SELECT 1 FROM "calendar_sync_state" WHERE "id" = 'airbnb')
     AND EXISTS (SELECT 1 FROM "calendar_sync_state" WHERE "id" = 'booking') THEN
    RAISE EXCEPTION 'Refusing to re-key calendar_sync_state: both the airbnb row and the booking row exist';
  END IF;
END $$;

ALTER TABLE "calendar_sync_state" DROP CONSTRAINT IF EXISTS "calendar_sync_state_singleton_check";

UPDATE "calendar_sync_state"
SET "id" = 'booking',
    "blocked_nights" = ARRAY[]::DATE[],
    "horizon_start" = NULL,
    "horizon_end" = NULL,
    "last_success_at" = NULL,
    "last_attempt_at" = NULL,
    "next_attempt_at" = CURRENT_TIMESTAMP,
    "last_failure_at" = NULL,
    "last_error_code" = NULL,
    "last_http_status" = NULL,
    "consecutive_failures" = 0,
    "lease_owner" = NULL,
    "lease_expires_at" = NULL,
    "created_at" = CURRENT_TIMESTAMP,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'airbnb';

INSERT INTO "calendar_sync_state" ("id")
SELECT 'booking' WHERE NOT EXISTS (SELECT 1 FROM "calendar_sync_state");

ALTER TABLE "calendar_sync_state"
  ADD CONSTRAINT "calendar_sync_state_singleton_check" CHECK ("id" = 'booking');
