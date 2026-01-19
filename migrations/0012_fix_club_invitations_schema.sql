-- Migration 0012: Fix Club Invitations Table Schema
-- Align column names with schema definition

-- Rename invited_email to email
DO $$ BEGIN
  ALTER TABLE "club_invitations" RENAME COLUMN "invited_email" TO "email";
EXCEPTION WHEN undefined_column THEN null; END $$;

-- Rename inviter_id to invited_by
DO $$ BEGIN
  ALTER TABLE "club_invitations" RENAME COLUMN "inviter_id" TO "invited_by";
EXCEPTION WHEN undefined_column THEN null; END $$;

-- Rename token to invite_token
DO $$ BEGIN
  ALTER TABLE "club_invitations" RENAME COLUMN "token" TO "invite_token";
EXCEPTION WHEN undefined_column THEN null; END $$;

-- Add status column if it doesn't exist
DO $$ BEGIN
  ALTER TABLE "club_invitations" ADD COLUMN "status" text NOT NULL DEFAULT 'pending';
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Set email column length constraint
DO $$ BEGIN
  ALTER TABLE "club_invitations" ALTER COLUMN "email" TYPE varchar(255);
EXCEPTION WHEN others THEN null; END $$;

-- Set invite_token column length constraint
DO $$ BEGIN
  ALTER TABLE "club_invitations" ALTER COLUMN "invite_token" TYPE varchar(64);
EXCEPTION WHEN others THEN null; END $$;

-- Drop old unique constraint on token and add new one on invite_token
DO $$ BEGIN
  ALTER TABLE "club_invitations" DROP CONSTRAINT IF EXISTS "club_invitations_token_unique";
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_invite_token_unique" UNIQUE("invite_token");
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Update foreign key constraints with new column names
DO $$ BEGIN
  ALTER TABLE "club_invitations" DROP CONSTRAINT IF EXISTS "club_invitations_inviter_id_fk";
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_invitations" ADD CONSTRAINT "club_invitations_invited_by_fk" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Update indexes
DROP INDEX IF EXISTS "club_invitations_email_idx";
DROP INDEX IF EXISTS "club_invitations_token_idx";

CREATE INDEX IF NOT EXISTS "club_invitations_email_idx" ON "club_invitations"("email");
CREATE INDEX IF NOT EXISTS "club_invitations_invite_token_idx" ON "club_invitations"("invite_token");
CREATE INDEX IF NOT EXISTS "club_invitations_status_idx" ON "club_invitations"("status");

-- Verification
SELECT 
    'Migration 0012 completed! Club invitations table schema fixed.' as result;