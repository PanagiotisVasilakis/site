BEGIN;

ALTER TABLE "bookings"
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "idx_bookings_updated_at" ON "bookings"("updated_at");

COMMIT;
