-- Migration 0020: Remove reading_history book_id foreign key
-- История чтения хранит статичные копии данных книг и должна сохраняться
-- даже после удаления книги. book_id может указывать на personal_books или books.

-- Удаляем foreign key constraint на books.id
DO $$ BEGIN
  ALTER TABLE "reading_history" DROP CONSTRAINT IF EXISTS "reading_history_book_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;

-- Удаляем club_id constraint если существует (club_id может отсутствовать в схеме)
DO $$ BEGIN
  ALTER TABLE "reading_history" DROP CONSTRAINT IF EXISTS "reading_history_club_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;

-- Удаляем колонку club_id если она существует (не используется в текущей схеме)
DO $$ BEGIN
  ALTER TABLE "reading_history" DROP COLUMN IF EXISTS "club_id";
EXCEPTION WHEN undefined_column THEN null; END $$;

SELECT 'Migration 0020 completed: reading_history book_id FK removed' as result;
