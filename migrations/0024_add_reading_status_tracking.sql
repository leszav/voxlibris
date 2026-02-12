-- Migration 0023: Add reading status tracking and goals
-- Система отслеживания статусов книг и целей чтения

BEGIN;

-- Таблица статусов книг для пользователей
CREATE TABLE IF NOT EXISTS "book_reading_status" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "book_id" VARCHAR NOT NULL, -- ID из personal_books или club_books
  "book_type" VARCHAR(20) NOT NULL CHECK (book_type IN ('personal', 'club')), -- Тип книги
  "status" VARCHAR(20) NOT NULL CHECK (status IN ('reading', 'completed', 'planned', 'abandoned')),
  "progress" INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100), -- Прогресс в процентах
  "started_at" TIMESTAMP, -- Когда начали читать
  "completed_at" TIMESTAMP, -- Когда завершили
  "notes" TEXT, -- Заметки пользователя
  "rating" INTEGER CHECK (rating >= 1 AND rating <= 5), -- Оценка книги
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, book_id, book_type)
);

-- Таблица целей чтения
CREATE TABLE IF NOT EXISTS "user_reading_goals" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "year" INTEGER NOT NULL,
  "goal_books" INTEGER NOT NULL DEFAULT 12 CHECK (goal_books > 0),
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, year)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS "book_reading_status_user_id_idx" ON "book_reading_status"("user_id");
CREATE INDEX IF NOT EXISTS "book_reading_status_user_status_idx" ON "book_reading_status"("user_id", "status");
CREATE INDEX IF NOT EXISTS "book_reading_status_book_idx" ON "book_reading_status"("book_id", "book_type");
CREATE INDEX IF NOT EXISTS "user_reading_goals_user_year_idx" ON "user_reading_goals"("user_id", "year");

-- Автообновление updated_at
CREATE OR REPLACE FUNCTION update_reading_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS book_reading_status_updated_at ON "book_reading_status";
CREATE TRIGGER book_reading_status_updated_at
  BEFORE UPDATE ON "book_reading_status"
  FOR EACH ROW
  EXECUTE FUNCTION update_reading_status_updated_at();

DROP TRIGGER IF EXISTS user_reading_goals_updated_at ON "user_reading_goals";
CREATE TRIGGER user_reading_goals_updated_at
  BEFORE UPDATE ON "user_reading_goals"
  FOR EACH ROW
  EXECUTE FUNCTION update_reading_status_updated_at();

COMMIT;

SELECT 'Migration 0023 completed: Reading status tracking and goals added' as result;
