DO $$
BEGIN
  CREATE TYPE "CheckInRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "check_in_requests" (
    "id" UUID NOT NULL,
    "booking_id" UUID,
    "user_id" UUID,
    "guest_name" TEXT,
    "guest_email" TEXT,
    "guest_phone" TEXT,
    "requested_time" TEXT NOT NULL,
    "message" TEXT,
    "status" "CheckInRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_check_in_requests_booking" ON "check_in_requests"("booking_id");
CREATE INDEX IF NOT EXISTS "idx_check_in_requests_user" ON "check_in_requests"("user_id");
CREATE INDEX IF NOT EXISTS "idx_check_in_requests_status_created" ON "check_in_requests"("status", "created_at");
