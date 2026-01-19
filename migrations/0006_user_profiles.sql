-- Migration 0006: User Profiles and Administration
-- Extended user profiles and admin functionality

-- User profiles extension
CREATE TABLE IF NOT EXISTS "user_profiles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "display_name" text,
  "avatar" text,
  "bio" text,
  "favorite_genres" text,
  "is_reader" boolean DEFAULT false NOT NULL,
  "reader_rating" integer DEFAULT 0 NOT NULL,
  "total_reading_sessions" integer DEFAULT 0 NOT NULL,
  "total_listeners" integer DEFAULT 0 NOT NULL,
  "cover_image" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Admin actions log
CREATE TABLE IF NOT EXISTS "admin_actions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id" varchar NOT NULL,
  "action_type" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" varchar NOT NULL,
  "reason" text,
  "previous_value" text,
  "new_value" text,
  "metadata" text,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Unique constraints
DO $$ BEGIN
  ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_fk" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "user_profiles_user_id_idx" ON "user_profiles"("user_id");
CREATE INDEX IF NOT EXISTS "user_profiles_is_reader_idx" ON "user_profiles"("is_reader");
CREATE INDEX IF NOT EXISTS "admin_actions_admin_id_idx" ON "admin_actions"("admin_id");
CREATE INDEX IF NOT EXISTS "admin_actions_target_idx" ON "admin_actions"("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "admin_actions_created_at_idx" ON "admin_actions"("created_at");