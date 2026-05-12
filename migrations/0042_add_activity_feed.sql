-- Migration: 0042_add_activity_feed
-- Sprint 2.1: Лента активности
-- Идемпотентна: можно запускать повторно

-- ============================================================
-- Типы событий
-- session_started     — чтец начал сессию
-- session_ended       — чтец завершил сессию
-- reading_completed   — пользователь дочитал книгу
-- joined_club         — пользователь вступил в клуб
-- followed_user       — пользователь подписался на другого
-- ============================================================

CREATE TABLE IF NOT EXISTS "activity_events" (
  "id"          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id"    varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_type"  text NOT NULL,
  "target_type" text,
  "target_id"   varchar,
  "metadata"    jsonb,
  "visibility"  text NOT NULL DEFAULT 'followers',
  "created_at"  timestamp NOT NULL DEFAULT now()
);

-- Upgrade path для legacy-схемы (если таблица была создана со старым payload)
ALTER TABLE "activity_events"
  ADD COLUMN IF NOT EXISTS "target_type" text,
  ADD COLUMN IF NOT EXISTS "target_id" varchar,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb,
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'followers';

-- Перенос данных из legacy payload -> metadata (безопасно при повторном запуске)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'activity_events' AND column_name = 'payload'
  ) THEN
    EXECUTE '
      UPDATE "activity_events"
      SET "metadata" = "payload"
      WHERE "metadata" IS NULL
    ';
  END IF;
END $$;

-- Индекс для быстрой выборки ленты по actor_id и времени
CREATE INDEX IF NOT EXISTS "idx_activity_events_actor_created"
  ON "activity_events"("actor_id", "created_at" DESC);

-- Индекс для выборки по типу (например, только session_started)
CREATE INDEX IF NOT EXISTS "idx_activity_events_type_created"
  ON "activity_events"("event_type", "created_at" DESC);

-- Индекс для cursor-based пагинации
CREATE INDEX IF NOT EXISTS "idx_activity_events_created_id"
  ON "activity_events"("created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_activity_events_visibility_created"
  ON "activity_events"("visibility", "created_at" DESC);
