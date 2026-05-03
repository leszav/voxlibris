-- Migration 0035: reader settings sync + personal-book bookmarks/notes
-- 1) Adds user_profiles.reader_settings for cross-device reader preferences sync
-- 2) Removes outdated book FK from bookmarks/notes so they work with personal_books too

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "reader_settings" text;

ALTER TABLE "bookmarks"
  DROP CONSTRAINT IF EXISTS "bookmarks_book_id_fk";

ALTER TABLE "notes"
  DROP CONSTRAINT IF EXISTS "notes_book_id_fk";

ALTER TABLE "bookmarks"
  DROP CONSTRAINT IF EXISTS "bookmarks_book_id_books_id_fk";

ALTER TABLE "notes"
  DROP CONSTRAINT IF EXISTS "notes_book_id_books_id_fk";
