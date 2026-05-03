-- Migration 0036: Remove reading_sessions book_id foreign key
-- reading_sessions.book_id может указывать на books.id (глобальные книги)
-- или на club_books.id (книги, загруженные в клуб). FK на books.id нарушается
-- при создании сессии клубного чтения. Поведение аналогично reading_history.book_id
-- (миграция 0020) и reading_progress.book_id, у которых FK уже снят.

-- Идемпотентное снятие FK с обработкой случая когда ограничение уже отсутствует
DO $$ BEGIN
  ALTER TABLE "reading_sessions" DROP CONSTRAINT IF EXISTS "reading_sessions_book_id_fk";
EXCEPTION WHEN undefined_object THEN null; END $$;

SELECT 'Migration 0036 completed: reading_sessions book_id FK removed' as result;
