-- Migration 0003: Club Features and Invitations
-- Club tags and invitation system

-- Club tags for categorization
CREATE TABLE IF NOT EXISTS "club_tags" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" varchar NOT NULL,
  "tag" text NOT NULL
);

-- Club invitations system
CREATE TABLE IF NOT EXISTS "club_invitations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" varchar NOT NULL,
  "inviter_id" varchar NOT NULL,
  "invited_email" text NOT NULL,
  "invited_user_id" varchar,
  "token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "declined_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Unique constraints
DO $$ BEGIN
  ALTER TABLE "club_tags" ADD CONSTRAINT "club_tags_club_tag_unique" UNIQUE("club_id", "tag");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_token_unique" UNIQUE("token");
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "club_tags" ADD CONSTRAINT "club_tags_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_inviter_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_invited_user_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "club_tags_club_id_idx" ON "club_tags"("club_id");
CREATE INDEX IF NOT EXISTS "club_tags_tag_idx" ON "club_tags"("tag");
CREATE INDEX IF NOT EXISTS "club_invitations_club_id_idx" ON "club_invitations"("club_id");
CREATE INDEX IF NOT EXISTS "club_invitations_email_idx" ON "club_invitations"("invited_email");
CREATE INDEX IF NOT EXISTS "club_invitations_token_idx" ON "club_invitations"("token");