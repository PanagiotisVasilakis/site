-- The booking-request form, its API and its admin views were removed (R3-F10,
-- R3-F11): no application code reads or writes stay requests or their outbox
-- events any more. Stay requests hold guest PII, so never silently destroy them:
-- stop the release and require an explicit export/retention decision if any
-- stay request, any event still linked to one, or any booking-request outbox
-- event (in any status) is left.
--
-- Every statement is guarded or IF EXISTS, so the file can be re-run safely.
-- No explicit BEGIN/COMMIT: PostgreSQL runs this multi-statement script as one
-- implicit transaction and stops at the guard, so Prisma reports the refusal
-- itself (with an explicit BEGIN the aborted transaction hides the message).
DO $$
DECLARE
  has_rows BOOLEAN;
BEGIN
  IF to_regclass('public.stay_requests') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.stay_requests LIMIT 1)' INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Refusing to remove non-empty table stay_requests';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'outbox_events' AND column_name = 'stay_request_id'
  ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.outbox_events WHERE stay_request_id IS NOT NULL LIMIT 1)'
      INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Refusing to remove outbox_events.stay_request_id while events still reference stay requests';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.outbox_events
    WHERE destination = 'booking_request_webhook' OR aggregate_type = 'stay_request'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Refusing to remove stay requests while booking-request outbox events remain';
  END IF;
END $$;

-- The column goes first: it carries the foreign key to stay_requests.
DROP INDEX IF EXISTS "idx_outbox_events_stay_request";
ALTER TABLE "outbox_events" DROP COLUMN IF EXISTS "stay_request_id";
-- Drops the table's indexes and its phone trigger, but not the trigger function.
DROP TABLE IF EXISTS "stay_requests";
DROP FUNCTION IF EXISTS "enforce_stay_requests_phone_e164"();
DROP TYPE IF EXISTS "StayRequestStatus";
