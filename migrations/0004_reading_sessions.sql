-- Migration 0004: Reading Sessions and Progress
-- Reading session management and user progress tracking

-- Reading sessions - live reading events
CREATE TABLE IF NOT EXISTS "reading_sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" varchar NOT NULL,
  "reader_id" varchar NOT NULL,
  "book_id" varchar NOT NULL,
  "title" text NOT NULL,
  "current_chapter" integer DEFAULT 1 NOT NULL,
  "current_position" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_live" boolean DEFAULT false NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "ended_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Reading progress for individual users
CREATE TABLE IF NOT EXISTS "reading_progress" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "book_id" varchar NOT NULL,
  "club_id" varchar,
  "current_chapter" integer DEFAULT 1 NOT NULL,
  "current_position" text,
  "progress" integer DEFAULT 0 NOT NULL,
  "last_read_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Reading history - completed books
CREATE TABLE IF NOT EXISTS "reading_history" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "book_id" varchar NOT NULL,
  "club_id" varchar,
  "completed_at" timestamp DEFAULT now() NOT NULL,
  "book_title" text NOT NULL,
  "book_author" text NOT NULL,
  "book_cover_url" text,
  "reading_time_minutes" integer DEFAULT 0
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_reader_id_fk" FOREIGN KEY ("reader_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reading_history" ADD CONSTRAINT "reading_history_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reading_history" ADD CONSTRAINT "reading_history_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "reading_history" ADD CONSTRAINT "reading_history_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "reading_sessions_club_id_idx" ON "reading_sessions"("club_id");
CREATE INDEX IF NOT EXISTS "reading_sessions_reader_id_idx" ON "reading_sessions"("reader_id");
CREATE INDEX IF NOT EXISTS "reading_sessions_book_id_idx" ON "reading_sessions"("book_id");
CREATE INDEX IF NOT EXISTS "reading_sessions_is_active_idx" ON "reading_sessions"("is_active");
CREATE INDEX IF NOT EXISTS "reading_progress_user_id_idx" ON "reading_progress"("user_id");
CREATE INDEX IF NOT EXISTS "reading_progress_book_id_idx" ON "reading_progress"("book_id");
CREATE INDEX IF NOT EXISTS "reading_progress_club_id_idx" ON "reading_progress"("club_id");
CREATE INDEX IF NOT EXISTS "reading_progress_user_book_idx" ON "reading_progress"("user_id", "book_id");
CREATE INDEX IF NOT EXISTS "reading_history_user_id_idx" ON "reading_history"("user_id");
CREATE INDEX IF NOT EXISTS "reading_history_book_id_idx" ON "reading_history"("book_id");
CREATE INDEX IF NOT EXISTS "reading_history_completed_at_idx" ON "reading_history"("completed_at");