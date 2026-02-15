-- Миграция: Создание таблицы reading_schedule
-- Создано: 2026-02-14
-- Статус: Idempotent (безопасно для повторного выполнения)

-- Создание таблицы reading_schedule
CREATE TABLE IF NOT EXISTS "reading_schedule" (
    "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    "club_id" VARCHAR NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
    "book_id" VARCHAR NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,

    -- Время проведения
    "scheduled_start" TIMESTAMP NOT NULL,
    "scheduled_end" TIMESTAMP,
    "estimated_duration" INTEGER, -- в минутах

    -- Текущая позиция в книге
    "start_chapter" INTEGER NOT NULL DEFAULT 1,
    "start_position" TEXT, -- JSON: {scrollTop, paragraph, offset}
    "end_chapter" INTEGER,
    "end_position" TEXT, -- JSON

    -- Статус расписания
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',

    -- Привязка к сессии чтения
    "session_id" VARCHAR REFERENCES "reading_sessions"("id"),

    -- Повторение
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurring_pattern" TEXT, -- JSON: {frequency: 'weekly', days: [1,3,5], endDate: '2025-03-01'}

    -- Уведомления
    "reminder_minutes" INTEGER DEFAULT 15,
    "reminders_sent" BOOLEAN NOT NULL DEFAULT false,

    -- Статистика
    "actual_start" TIMESTAMP,
    "actual_end" TIMESTAMP,
    "attendees_count" INTEGER DEFAULT 0,

    -- Аудит
    "created_by" VARCHAR NOT NULL REFERENCES "users"("id"),
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_reading_schedule_club_id ON "reading_schedule"("club_id");
CREATE INDEX IF NOT EXISTS idx_reading_schedule_book_id ON "reading_schedule"("book_id");
CREATE INDEX IF NOT EXISTS idx_reading_schedule_status ON "reading_schedule"("status");
CREATE INDEX IF NOT EXISTS idx_reading_schedule_scheduled_start ON "reading_schedule"("scheduled_start");
CREATE INDEX IF NOT EXISTS idx_reading_schedule_created_by ON "reading_schedule"("created_by");
CREATE INDEX IF NOT EXISTS idx_reading_schedule_session_id ON "reading_schedule"("session_id");
