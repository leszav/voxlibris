-- Migration 0029: Add missing Studio realtime tables
-- Safe/idempotent migration: only CREATE IF NOT EXISTS / DROP TRIGGER IF EXISTS

BEGIN;

-- Club reading status (multi-reader support)
CREATE TABLE IF NOT EXISTS "club_reading_status" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" varchar NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "book_id" varchar NOT NULL REFERENCES "books"("id"),
  "session_id" varchar REFERENCES "reading_sessions"("id"),
  "is_active" boolean NOT NULL DEFAULT false,
  "started_at" timestamp,
  "current_chapter" integer NOT NULL DEFAULT 1,
  "current_position" text,
  "is_open_for_listeners" boolean NOT NULL DEFAULT true,
  "listener_count" integer NOT NULL DEFAULT 0,
  "session_type" varchar(20) NOT NULL DEFAULT 'general' CHECK ("session_type" IN ('general', 'reader_club')),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Session reactions (positive/negative)
CREATE TABLE IF NOT EXISTS "session_reactions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar NOT NULL REFERENCES "reading_sessions"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "emoji" varchar(50) NOT NULL,
  "type" varchar(20) NOT NULL DEFAULT 'positive' CHECK ("type" IN ('positive', 'negative')),
  "position" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Session questions
CREATE TABLE IF NOT EXISTS "session_questions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar NOT NULL REFERENCES "reading_sessions"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "question" text NOT NULL,
  "is_answered" boolean NOT NULL DEFAULT false,
  "answer" text,
  "answered_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Session analytics
CREATE TABLE IF NOT EXISTS "session_analytics" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar NOT NULL REFERENCES "reading_sessions"("id") ON DELETE CASCADE,
  "peak_listener_count" integer DEFAULT 0,
  "average_listener_count" integer DEFAULT 0,
  "total_listeners" integer DEFAULT 0,
  "total_listen_time" integer DEFAULT 0,
  "average_session_duration" integer DEFAULT 0,
  "reaction_count" integer DEFAULT 0,
  "positive_reaction_count" integer DEFAULT 0,
  "negative_reaction_count" integer DEFAULT 0,
  "question_count" integer DEFAULT 0,
  "audio_quality_score" integer,
  "network_quality_score" integer,
  "listener_regions" text,
  "listener_cities" text,
  "device_types" text,
  "retention" text,
  "metadata" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Indexes: club_reading_status
CREATE INDEX IF NOT EXISTS "club_reading_status_club_id_active_idx"
  ON "club_reading_status"("club_id", "is_active");
CREATE INDEX IF NOT EXISTS "club_reading_status_user_id_active_idx"
  ON "club_reading_status"("user_id", "is_active");
CREATE INDEX IF NOT EXISTS "club_reading_status_session_id_idx"
  ON "club_reading_status"("session_id");
CREATE INDEX IF NOT EXISTS "club_reading_status_updated_at_idx"
  ON "club_reading_status"("updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "club_reading_status_session_id_unique_idx"
  ON "club_reading_status"("session_id")
  WHERE "session_id" IS NOT NULL;

-- Indexes: session_reactions
CREATE INDEX IF NOT EXISTS "session_reactions_session_id_idx"
  ON "session_reactions"("session_id");
CREATE INDEX IF NOT EXISTS "session_reactions_user_id_idx"
  ON "session_reactions"("user_id");
CREATE INDEX IF NOT EXISTS "session_reactions_session_created_at_idx"
  ON "session_reactions"("session_id", "created_at");

-- Indexes: session_questions
CREATE INDEX IF NOT EXISTS "session_questions_session_id_idx"
  ON "session_questions"("session_id");
CREATE INDEX IF NOT EXISTS "session_questions_user_id_idx"
  ON "session_questions"("user_id");
CREATE INDEX IF NOT EXISTS "session_questions_session_answered_idx"
  ON "session_questions"("session_id", "is_answered");
CREATE INDEX IF NOT EXISTS "session_questions_created_at_idx"
  ON "session_questions"("created_at");

-- Indexes: session_analytics
CREATE UNIQUE INDEX IF NOT EXISTS "session_analytics_session_id_unique_idx"
  ON "session_analytics"("session_id");
CREATE INDEX IF NOT EXISTS "session_analytics_created_at_idx"
  ON "session_analytics"("created_at");
CREATE INDEX IF NOT EXISTS "session_analytics_updated_at_idx"
  ON "session_analytics"("updated_at");

-- Updated-at trigger helper
CREATE OR REPLACE FUNCTION update_studio_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS club_reading_status_updated_at ON "club_reading_status";
CREATE TRIGGER club_reading_status_updated_at
  BEFORE UPDATE ON "club_reading_status"
  FOR EACH ROW
  EXECUTE FUNCTION update_studio_updated_at();

DROP TRIGGER IF EXISTS session_analytics_updated_at ON "session_analytics";
CREATE TRIGGER session_analytics_updated_at
  BEFORE UPDATE ON "session_analytics"
  FOR EACH ROW
  EXECUTE FUNCTION update_studio_updated_at();

COMMIT;

SELECT 'Migration 0029 completed: Studio realtime tables are present' AS result;
