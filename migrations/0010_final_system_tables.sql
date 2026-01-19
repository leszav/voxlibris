-- Migration 0010: Final System Tables
-- Analytics, legal compliance, and system configuration

-- Legal acknowledgments for compliance
CREATE TABLE IF NOT EXISTS "legal_acknowledgments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "upload_context_id" varchar NOT NULL,
  "ip_address" text NOT NULL,
  "user_agent" text,
  "acknowledged_at" timestamp DEFAULT now() NOT NULL
);

-- Settings table for application configuration
CREATE TABLE IF NOT EXISTS "settings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "value" text NOT NULL,
  "type" text DEFAULT 'string' NOT NULL,
  "description" text,
  "updated_by" varchar,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Analytics events for tracking
CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar,
  "event_type" text NOT NULL,
  "event_data" text,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Unique constraints
DO $$ BEGIN
  ALTER TABLE "settings" ADD CONSTRAINT "settings_key_unique" UNIQUE("key");
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "legal_acknowledgments" ADD CONSTRAINT "legal_acknowledgments_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "legal_acknowledgments" ADD CONSTRAINT "legal_acknowledgments_upload_context_id_fk" FOREIGN KEY ("upload_context_id") REFERENCES "upload_contexts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add book_id reference to clubs (nullable)
DO $$ BEGIN
  ALTER TABLE "clubs" ADD CONSTRAINT "clubs_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "club_books"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "legal_acknowledgments_user_id_idx" ON "legal_acknowledgments"("user_id");
CREATE INDEX IF NOT EXISTS "legal_acknowledgments_upload_context_id_idx" ON "legal_acknowledgments"("upload_context_id");
CREATE INDEX IF NOT EXISTS "settings_key_idx" ON "settings"("key");
CREATE INDEX IF NOT EXISTS "analytics_events_user_id_idx" ON "analytics_events"("user_id");
CREATE INDEX IF NOT EXISTS "analytics_events_event_type_idx" ON "analytics_events"("event_type");
CREATE INDEX IF NOT EXISTS "analytics_events_created_at_idx" ON "analytics_events"("created_at");

-- Final verification
SELECT 
    'Migration 0010 completed! Database schema ready.' as result;