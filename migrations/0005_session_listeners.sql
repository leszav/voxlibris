-- Migration 0005: Session Listeners and Ratings
-- Session listener management and reader feedback system

-- Session listeners - who is listening to which session
CREATE TABLE IF NOT EXISTS "session_listeners" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar NOT NULL,
  "listener_id" varchar NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  "left_at" timestamp,
  "is_active" boolean DEFAULT true NOT NULL
);

-- Reader ratings and feedback
CREATE TABLE IF NOT EXISTS "reader_ratings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar NOT NULL,
  "reader_id" varchar NOT NULL,
  "rater_id" varchar NOT NULL,
  "rating" integer NOT NULL,
  "feedback" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "session_listeners" ADD CONSTRAINT "session_listeners_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "reading_sessions"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "session_listeners" ADD CONSTRAINT "session_listeners_listener_id_fk" FOREIGN KEY ("listener_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reader_ratings" ADD CONSTRAINT "reader_ratings_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "reading_sessions"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reader_ratings" ADD CONSTRAINT "reader_ratings_reader_id_fk" FOREIGN KEY ("reader_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reader_ratings" ADD CONSTRAINT "reader_ratings_rater_id_fk" FOREIGN KEY ("rater_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "session_listeners_session_id_idx" ON "session_listeners"("session_id");
CREATE INDEX IF NOT EXISTS "session_listeners_listener_id_idx" ON "session_listeners"("listener_id");
CREATE INDEX IF NOT EXISTS "reader_ratings_session_id_idx" ON "reader_ratings"("session_id");
CREATE INDEX IF NOT EXISTS "reader_ratings_reader_id_idx" ON "reader_ratings"("reader_id");
CREATE INDEX IF NOT EXISTS "reader_ratings_rater_id_idx" ON "reader_ratings"("rater_id");