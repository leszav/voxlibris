-- Migration 0008: Reader Bookmarks and Notes
-- Reader annotation and bookmark system

-- Bookmarks for readers
CREATE TABLE IF NOT EXISTS "bookmarks" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "book_id" varchar NOT NULL,
  "chapter_number" integer,
  "position" text NOT NULL,
  "title" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Notes and annotations
CREATE TABLE IF NOT EXISTS "notes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "book_id" varchar NOT NULL,
  "chapter_number" integer,
  "position" text NOT NULL,
  "highlighted_text" text,
  "note_text" text NOT NULL,
  "color" varchar(20) DEFAULT 'yellow',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "notes" ADD CONSTRAINT "notes_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "bookmarks_user_id_idx" ON "bookmarks"("user_id");
CREATE INDEX IF NOT EXISTS "bookmarks_book_id_idx" ON "bookmarks"("book_id");
CREATE INDEX IF NOT EXISTS "bookmarks_user_book_idx" ON "bookmarks"("user_id", "book_id");
CREATE INDEX IF NOT EXISTS "notes_user_id_idx" ON "notes"("user_id");
CREATE INDEX IF NOT EXISTS "notes_book_id_idx" ON "notes"("book_id");
CREATE INDEX IF NOT EXISTS "notes_user_book_idx" ON "notes"("user_id", "book_id");
CREATE INDEX IF NOT EXISTS "notes_updated_at_idx" ON "notes"("updated_at");