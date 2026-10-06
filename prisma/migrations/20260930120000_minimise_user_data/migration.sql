-- Data minimisation (R-302, R-042). users.country_origin was only needed to
-- normalise the phone number once at sign-up, and users.email has no writer in
-- the current code; neither is read for any purpose any more. Neither value can
-- be re-derived by any flow (an ABROAD guest may also have a +30 number), so
-- never silently destroy one: stop the release and require an explicit
-- retention/export decision if any user still holds a value in either column.
-- country_origin is NOT NULL, so its guard refuses on any user row at all.
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
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'country_origin'
  ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.users WHERE country_origin IS NOT NULL LIMIT 1)' INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Refusing to remove users.country_origin while users still hold a value';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
  ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.users WHERE email IS NOT NULL LIMIT 1)' INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Refusing to remove users.email while users still hold an address';
    END IF;
  END IF;
END $$;

DROP INDEX IF EXISTS "idx_users_country_origin";
ALTER TABLE "users" DROP COLUMN IF EXISTS "country_origin";
DROP TYPE IF EXISTS "CountryOrigin";
DROP INDEX IF EXISTS "users_email_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "email";
