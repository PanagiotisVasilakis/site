-- bookings.reference has no writer any more (R-203): the admin form stores the
-- host's reference in external_reference, and the admin views and reference
-- search read external_reference only. Never silently destroy a booking
-- reference: stop the release and require an explicit backfill decision if any
-- row still holds a value in the column.
--
-- Every statement is guarded or IF EXISTS, so the file can be re-run safely.
-- No explicit BEGIN/COMMIT: PostgreSQL runs this multi-statement script as one
-- implicit transaction and stops at the guard, so Prisma reports the refusal
-- itself (with an explicit BEGIN the aborted transaction hides the message).
DO $$
DECLARE
  has_rows BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'reference'
  ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.bookings WHERE reference IS NOT NULL LIMIT 1)' INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Refusing to remove bookings.reference while bookings still hold a reference';
    END IF;
  END IF;
END $$;

DROP INDEX IF EXISTS "idx_bookings_reference";
ALTER TABLE "bookings" DROP COLUMN IF EXISTS "reference";
