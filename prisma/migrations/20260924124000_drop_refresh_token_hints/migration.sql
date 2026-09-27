-- R-044: refresh tokens copied their family's device and IP hashes into
-- device_hint/ip_hint (at creation and on every rotation), and nothing read the
-- copies; the family columns remain the only, checked, source. Drop the copies
-- only while they are exact duplicates: stop if any token carries a value that
-- differs from its family, so no distinct data is lost silently.
--
-- No explicit BEGIN/COMMIT: PostgreSQL runs this multi-statement script as one
-- implicit transaction and stops at the guard, so Prisma reports the refusal
-- itself (with an explicit BEGIN the aborted transaction hides the message).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "refresh_tokens" t
    JOIN "refresh_token_families" f ON f."id" = t."family_id"
    WHERE (t."device_hint" IS NOT NULL AND t."device_hint" IS DISTINCT FROM f."device_hash")
       OR (t."ip_hint" IS NOT NULL AND t."ip_hint" IS DISTINCT FROM f."ip_hash")
  ) THEN
    RAISE EXCEPTION 'Refusing to drop refresh token hints that differ from their family';
  END IF;
END $$;

ALTER TABLE "refresh_tokens" DROP COLUMN "device_hint", DROP COLUMN "ip_hint";
