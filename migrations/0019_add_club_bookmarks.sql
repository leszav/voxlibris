-- Migration 0019: Add Club Bookmarks Table
-- Таблица для клубных закладок (общие точки для всех участников клуба)

CREATE TABLE IF NOT EXISTS "club_bookmarks" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_book_id" varchar NOT NULL,
  "created_by" varchar NOT NULL,
  "position" integer NOT NULL,
  "chapter" varchar(255),
  "title" varchar(255) NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "club_bookmarks" ADD CONSTRAINT "club_bookmarks_club_book_id_fk" 
    FOREIGN KEY ("club_book_id") REFERENCES "club_books"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_bookmarks" ADD CONSTRAINT "club_bookmarks_created_by_fk" 
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "club_bookmarks_club_book_id_idx" ON "club_bookmarks"("club_book_id");
CREATE INDEX IF NOT EXISTS "club_bookmarks_created_by_idx" ON "club_bookmarks"("created_by");
CREATE INDEX IF NOT EXISTS "club_bookmarks_created_at_idx" ON "club_bookmarks"("created_at");

SELECT 'Migration 0019 completed: club_bookmarks table created' as result;
