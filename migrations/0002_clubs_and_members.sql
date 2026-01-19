-- Migration 0002: Clubs and Members System
-- Club management and membership structure

-- Clubs table
CREATE TABLE IF NOT EXISTS "clubs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text,
  "cover_image" text,
  "book_id" varchar,
  "owner_id" varchar NOT NULL,
  "type" text DEFAULT 'standard' NOT NULL,
  "status" text DEFAULT 'recruiting' NOT NULL,
  "max_members" integer DEFAULT 50 NOT NULL,
  "is_private" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_live" boolean DEFAULT false NOT NULL,
  "is_featured" boolean DEFAULT false NOT NULL,
  "schedule" text,
  "settings" text,
  "archived_at" timestamp,
  "archive_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Club members - many-to-many relationship
CREATE TABLE IF NOT EXISTS "club_members" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "clubs" ADD CONSTRAINT "clubs_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_members" ADD CONSTRAINT "club_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "clubs_owner_id_idx" ON "clubs"("owner_id");
CREATE INDEX IF NOT EXISTS "clubs_book_id_idx" ON "clubs"("book_id");
CREATE INDEX IF NOT EXISTS "clubs_status_idx" ON "clubs"("status");
CREATE INDEX IF NOT EXISTS "clubs_type_idx" ON "clubs"("type");
CREATE INDEX IF NOT EXISTS "club_members_club_id_idx" ON "club_members"("club_id");
CREATE INDEX IF NOT EXISTS "club_members_user_id_idx" ON "club_members"("user_id");
CREATE INDEX IF NOT EXISTS "club_members_club_user_idx" ON "club_members"("club_id", "user_id");