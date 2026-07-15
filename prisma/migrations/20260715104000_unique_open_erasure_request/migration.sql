BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "privacy_requests"
    WHERE "user_id" IS NOT NULL
      AND "request_type" = 'ERASURE'
      AND "status" IN ('PENDING', 'VERIFIED')
    GROUP BY "user_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one open erasure request per user: duplicates exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "privacy_requests_one_open_erasure_per_user"
  ON "privacy_requests"("user_id")
  WHERE "user_id" IS NOT NULL
    AND "request_type" = 'ERASURE'
    AND "status" IN ('PENDING', 'VERIFIED');

COMMIT;
