BEGIN;

ALTER TABLE "analytics_hits"
  ADD COLUMN "event_id" VARCHAR(128);

CREATE UNIQUE INDEX "analytics_hits_event_id_key"
  ON "analytics_hits"("event_id");

COMMIT;
