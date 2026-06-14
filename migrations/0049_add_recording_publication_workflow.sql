-- Migration 0049: Add moderation/publication workflow for session recordings
-- Safe/idempotent migration: additive columns and indexes only

BEGIN;

ALTER TABLE "session_recordings"
  ADD COLUMN IF NOT EXISTS "moderation_status" varchar(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "moderated_by" varchar REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "moderated_at" timestamp,
  ADD COLUMN IF NOT EXISTS "moderation_notes" text,
  ADD COLUMN IF NOT EXISTS "published_by" varchar REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "published_at" timestamp,
  ADD COLUMN IF NOT EXISTS "is_published" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "public_title" varchar(255),
  ADD COLUMN IF NOT EXISTS "public_author" varchar(255),
  ADD COLUMN IF NOT EXISTS "public_description" text,
  ADD COLUMN IF NOT EXISTS "cover_image_url" text,
  ADD COLUMN IF NOT EXISTS "allow_streaming" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allow_download" boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  ALTER TABLE "session_recordings"
    ADD CONSTRAINT "session_recordings_moderation_status_check"
    CHECK ("moderation_status" IN ('pending', 'approved', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "session_recordings_moderation_status_idx"
  ON "session_recordings"("moderation_status");
CREATE INDEX IF NOT EXISTS "session_recordings_publication_idx"
  ON "session_recordings"("club_id", "is_published", "moderation_status");

COMMIT;

SELECT 'Migration 0049 completed: recording moderation/publication workflow is present' AS result;
