-- No application code writes these tables any more: metrics and logs never had
-- a writer (R-038), analytics and Web Vitals were removed (S2), and privacy
-- holds lost their only API with the privacy-request routes (C2, O13). Never
-- silently destroy retained data from an older deployment: stop the release and
-- require an explicit export/retention decision if any table still has rows.
--
-- No explicit BEGIN/COMMIT: PostgreSQL runs this multi-statement script as one
-- implicit transaction and stops at the guard, so Prisma reports the refusal
-- itself (with an explicit BEGIN the aborted transaction hides the message).
DO $$
DECLARE
  dead_table TEXT;
  has_rows BOOLEAN;
BEGIN
  FOREACH dead_table IN ARRAY ARRAY['metrics', 'logs', 'analytics_hits', 'analytics_vitals', 'privacy_holds'] LOOP
    IF to_regclass(format('public.%I', dead_table)) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I LIMIT 1)', dead_table) INTO has_rows;
      IF has_rows THEN
        RAISE EXCEPTION 'Refusing to remove non-empty table %', dead_table;
      END IF;
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS "metrics";
DROP TABLE IF EXISTS "logs";
DROP TABLE IF EXISTS "analytics_hits";
DROP TABLE IF EXISTS "analytics_vitals";
DROP TABLE IF EXISTS "privacy_holds";
