-- Fix analytics_events table schema
-- Add missing columns that exist in TypeScript schema but not in database

-- Add missing columns to analytics_events table
ALTER TABLE "analytics_events" 
  ADD COLUMN IF NOT EXISTS "book_id" varchar,
  ADD COLUMN IF NOT EXISTS "club_id" varchar,
  ADD COLUMN IF NOT EXISTS "chapter_number" integer,
  ADD COLUMN IF NOT EXISTS "duration" integer,
  ADD COLUMN IF NOT EXISTS "progress" integer,
  ADD COLUMN IF NOT EXISTS "metadata" text;

-- Remove old columns that are no longer used
ALTER TABLE "analytics_events" 
  DROP COLUMN IF EXISTS "event_data";

-- Add foreign key constraints
DO $$ BEGIN
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_book_id_fk" 
    FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_club_id_fk" 
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS "analytics_events_book_id_idx" ON "analytics_events"("book_id");
CREATE INDEX IF NOT EXISTS "analytics_events_club_id_idx" ON "analytics_events"("club_id");
CREATE INDEX IF NOT EXISTS "analytics_events_event_type_created_at_idx" ON "analytics_events"("event_type", "created_at");
