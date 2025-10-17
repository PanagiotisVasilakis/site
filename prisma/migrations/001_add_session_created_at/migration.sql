-- Add created_at column to sessions for auditing and compatibility with legacy store
ALTER TABLE "sessions"
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Ensure consistent lookup ordering by creation time
CREATE INDEX IF NOT EXISTS "idx_sessions_created_at" ON "sessions"("created_at");
