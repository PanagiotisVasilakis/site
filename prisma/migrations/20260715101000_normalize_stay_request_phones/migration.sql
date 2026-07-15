BEGIN;

-- Canonicalize common legacy representations so DSAR matching does not miss
-- retained booking-request PII. The property is in Greece, so a 10-digit local
-- number is treated as Greek; international numbers require a country prefix.
UPDATE "stay_requests"
SET "phone" = CASE
  WHEN "phone" ~ '^\+[1-9][0-9]{7,14}$' THEN "phone"
  WHEN "phone" ~ '^30[0-9]{10}$' THEN '+' || "phone"
  WHEN "phone" ~ '^[26789][0-9]{9}$' THEN '+30' || "phone"
  WHEN "phone" ~ '^[1-9][0-9]{7,14}$' THEN '+' || "phone"
  ELSE "phone"
END;

-- Enforce canonical values for new records and explicit phone changes without
-- blocking unrelated updates to malformed historical rows. A NOT VALID CHECK
-- constraint would still be evaluated for every UPDATE, including a status-only
-- outbox transition, and could therefore strand legacy requests indefinitely.
CREATE FUNCTION "enforce_stay_requests_phone_e164"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."phone" !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'stay_requests_phone_e164_check',
      MESSAGE = 'stay_requests.phone must use canonical E.164 format';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "stay_requests_phone_e164_enforcement"
BEFORE INSERT OR UPDATE OF "phone" ON "stay_requests"
FOR EACH ROW
EXECUTE FUNCTION "enforce_stay_requests_phone_e164"();

COMMIT;
