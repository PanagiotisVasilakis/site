BEGIN;

-- R-041: erasure, admin retry/close and the DEAD-event lifecycle filter outbox
-- events by stay request. The index was dropped by
-- 20260714150000_trustworthy_portal_and_operations and never recreated.
CREATE INDEX "idx_outbox_events_stay_request" ON "outbox_events"("stay_request_id");

COMMIT;
