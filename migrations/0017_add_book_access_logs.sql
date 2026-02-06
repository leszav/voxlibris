-- Migration 0017: Add book_access_logs table

CREATE TABLE IF NOT EXISTS "book_access_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "book_id" varchar NOT NULL,
  "book_type" text NOT NULL,
  "user_id" varchar NOT NULL,
  "action" text NOT NULL,
  "timestamp" timestamp DEFAULT now() NOT NULL,
  "device_type" text,
  "session_duration_minutes" integer,
  "ip_hash" text
);

DO $$ BEGIN
  ALTER TABLE "book_access_logs" ADD CONSTRAINT "book_access_logs_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "book_access_logs_user_id_idx" ON "book_access_logs"("user_id");
CREATE INDEX IF NOT EXISTS "book_access_logs_book_id_idx" ON "book_access_logs"("book_id");
CREATE INDEX IF NOT EXISTS "book_access_logs_action_idx" ON "book_access_logs"("action");
CREATE INDEX IF NOT EXISTS "book_access_logs_timestamp_idx" ON "book_access_logs"("timestamp");
