BEGIN;

-- PROCESSING was renamed to LEASED before lease metadata existed. Any row that
-- reached that state during the upgrade has no owner and/or expiry, so the
-- worker's abandoned-lease recovery predicate can never claim it. Return only
-- those incomplete leases to the retry queue; fully formed active leases remain
-- untouched.
UPDATE "outbox_events"
SET
  "status" = 'PENDING',
  "next_attempt_at" = CURRENT_TIMESTAMP,
  "lease_owner" = NULL,
  "lease_expires_at" = NULL,
  "last_error" = 'Recovered legacy delivery lease without complete metadata'
WHERE "status" = 'LEASED'
  AND ("lease_owner" IS NULL OR "lease_expires_at" IS NULL);

COMMIT;
