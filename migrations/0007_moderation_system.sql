-- Migration 0007: Moderation and Reports System
-- Content moderation and reporting functionality

-- Moderation reports
CREATE TABLE IF NOT EXISTS "moderation_reports" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" text NOT NULL,
  "target_id" varchar NOT NULL,
  "reporter_id" varchar NOT NULL,
  "reason" text NOT NULL,
  "description" text NOT NULL,
  "status" text DEFAULT 'new' NOT NULL,
  "priority" text DEFAULT 'medium' NOT NULL,
  "assigned_to" varchar,
  "resolution" text,
  "admin_notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp
);

-- System settings
CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "type" text NOT NULL,
  "category" text DEFAULT 'general' NOT NULL,
  "description" text,
  "is_public" boolean DEFAULT false NOT NULL,
  "updated_by" varchar,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reporter_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_assigned_to_fk" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "moderation_reports_reporter_id_idx" ON "moderation_reports"("reporter_id");
CREATE INDEX IF NOT EXISTS "moderation_reports_status_idx" ON "moderation_reports"("status");
CREATE INDEX IF NOT EXISTS "moderation_reports_assigned_to_idx" ON "moderation_reports"("assigned_to");