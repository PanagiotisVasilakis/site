-- R-015: the check-in completion flow (/api/check-in, /complete, /complete/get)
-- has had no client since 2c4475c and was removed, so nothing writes
-- "checkins" any more; the admin views only showed legacy rows. Never silently
-- destroy retained guest data: stop the release and require an explicit
-- export/retention decision if the table still has rows.
--
-- No explicit BEGIN/COMMIT: PostgreSQL runs this multi-statement script as one
-- implicit transaction and stops at the guard, so Prisma reports the refusal
-- itself (with an explicit BEGIN the aborted transaction hides the message).
DO $$
DECLARE
  has_rows BOOLEAN;
BEGIN
  IF to_regclass('public.checkins') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM "checkins" LIMIT 1)' INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Refusing to remove non-empty table checkins';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "checkins";
