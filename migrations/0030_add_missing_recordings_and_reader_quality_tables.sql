-- Migration 0030: Add missing session_recordings and reader_quality_ratings tables
-- Safe/idempotent migration: only CREATE IF NOT EXISTS

BEGIN;

-- Session recordings (Reader Club recordings)
CREATE TABLE IF NOT EXISTS "session_recordings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar NOT NULL REFERENCES "reading_sessions"("id") ON DELETE CASCADE,
  "club_id" varchar NOT NULL REFERENCES "clubs"("id"),

  -- File info
  "recording_url" text,
  "storage_key" text,
  "duration" integer,
  "file_size" integer,
  "format" varchar(20) DEFAULT 'webm',

  -- Processing status
  "status" varchar(20) NOT NULL DEFAULT 'processing'
    CHECK ("status" IN ('processing', 'ready', 'failed', 'deleted')),

  -- Recording type
  "is_local" boolean DEFAULT false,
  "is_backup" boolean DEFAULT false,

  -- Quality metadata
  "bitrate" integer,
  "sample_rate" integer,
  "channels" integer,

  -- Availability
  "is_available" boolean NOT NULL DEFAULT true,
  "available_until" timestamp,

  -- Extra metadata (JSON text)
  "metadata" text,

  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "session_recordings_session_id_idx"
  ON "session_recordings"("session_id");
CREATE INDEX IF NOT EXISTS "session_recordings_club_id_idx"
  ON "session_recordings"("club_id");
CREATE INDEX IF NOT EXISTS "session_recordings_status_idx"
  ON "session_recordings"("status");
CREATE INDEX IF NOT EXISTS "session_recordings_club_available_idx"
  ON "session_recordings"("club_id", "is_available");
CREATE INDEX IF NOT EXISTS "session_recordings_available_until_idx"
  ON "session_recordings"("available_until");
CREATE INDEX IF NOT EXISTS "session_recordings_created_at_idx"
  ON "session_recordings"("created_at");

-- Reader quality ratings
CREATE TABLE IF NOT EXISTS "reader_quality_ratings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "rated_user_id" varchar NOT NULL REFERENCES "users"("id"),
  "rater_user_id" varchar NOT NULL REFERENCES "users"("id"),
  "club_id" varchar REFERENCES "clubs"("id"),

  -- Criteria (1-5)
  "voice_quality" integer CHECK ("voice_quality" BETWEEN 1 AND 5),
  "reading_pace" integer CHECK ("reading_pace" BETWEEN 1 AND 5),
  "articulation" integer CHECK ("articulation" BETWEEN 1 AND 5),
  "emotion" integer CHECK ("emotion" BETWEEN 1 AND 5),

  -- Overall rating (required, 1-5)
  "overall_rating" integer NOT NULL CHECK ("overall_rating" BETWEEN 1 AND 5),

  -- Optional feedback
  "feedback" text,

  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "reader_quality_ratings_rated_user_idx"
  ON "reader_quality_ratings"("rated_user_id");
CREATE INDEX IF NOT EXISTS "reader_quality_ratings_club_idx"
  ON "reader_quality_ratings"("club_id");
CREATE INDEX IF NOT EXISTS "reader_quality_ratings_created_at_idx"
  ON "reader_quality_ratings"("created_at");
CREATE INDEX IF NOT EXISTS "reader_quality_ratings_rater_rated_club_idx"
  ON "reader_quality_ratings"("rater_user_id", "rated_user_id", "club_id");

COMMIT;

SELECT 'Migration 0030 completed: session_recordings and reader_quality_ratings are present' AS result;
