BEGIN;

-- MFA implementation and the database-backed generic cache were retired from
-- the application before this migration. Never silently destroy retained
-- credentials or cache records from an older deployment: stop the release and
-- require an explicit export/retention decision if any table still has rows.
DO $$
DECLARE
  has_rows BOOLEAN;
BEGIN
  IF to_regclass('public.mfa_challenges') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM "mfa_challenges" LIMIT 1)' INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Refusing to remove non-empty legacy table mfa_challenges';
    END IF;
  END IF;

  IF to_regclass('public.mfa_factors') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM "mfa_factors" LIMIT 1)' INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Refusing to remove non-empty legacy table mfa_factors';
    END IF;
  END IF;

  IF to_regclass('public.cache') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM "cache" LIMIT 1)' INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Refusing to remove non-empty legacy table cache';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "mfa_challenges";
DROP TABLE IF EXISTS "mfa_factors";
DROP TABLE IF EXISTS "cache";
DROP TYPE IF EXISTS "MfaFactorStatus";
DROP TYPE IF EXISTS "MfaFactorType";

COMMIT;
