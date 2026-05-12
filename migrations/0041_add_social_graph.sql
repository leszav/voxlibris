-- Migration 0041: Social graph — follows, blocks, mutes, privacy settings

-- Таблица подписок (граф связей)
CREATE TABLE IF NOT EXISTS "user_follows" (
  "id"           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "follower_id"  VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "following_id" VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "user_follows_unique" UNIQUE ("follower_id", "following_id"),
  CONSTRAINT "user_follows_no_self" CHECK ("follower_id" != "following_id")
);
CREATE INDEX IF NOT EXISTS "idx_user_follows_follower"  ON "user_follows"("follower_id");
CREATE INDEX IF NOT EXISTS "idx_user_follows_following" ON "user_follows"("following_id");

-- Таблица блокировок
CREATE TABLE IF NOT EXISTS "user_blocks" (
  "id"         VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "blocker_id" VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_id" VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "user_blocks_unique"  UNIQUE ("blocker_id", "blocked_id"),
  CONSTRAINT "user_blocks_no_self" CHECK ("blocker_id" != "blocked_id")
);
CREATE INDEX IF NOT EXISTS "idx_user_blocks_blocker" ON "user_blocks"("blocker_id");
CREATE INDEX IF NOT EXISTS "idx_user_blocks_blocked" ON "user_blocks"("blocked_id");

-- Таблица мутов (скрыть активность без полной блокировки)
CREATE TABLE IF NOT EXISTS "user_mutes" (
  "id"         VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "muter_id"   VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "muted_id"   VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "user_mutes_unique"  UNIQUE ("muter_id", "muted_id"),
  CONSTRAINT "user_mutes_no_self" CHECK ("muter_id" != "muted_id")
);
CREATE INDEX IF NOT EXISTS "idx_user_mutes_muter" ON "user_mutes"("muter_id");

-- Настройки приватности профиля
CREATE TABLE IF NOT EXISTS "user_privacy_settings" (
  "user_id"                  VARCHAR PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_visibility"       TEXT NOT NULL DEFAULT 'public',
  "reading_stats_visible"    BOOLEAN NOT NULL DEFAULT true,
  "clubs_visible"            BOOLEAN NOT NULL DEFAULT true,
  "reading_history_visible"  BOOLEAN NOT NULL DEFAULT true,
  "allow_dm_from"            TEXT NOT NULL DEFAULT 'followers',
  "updated_at"               TIMESTAMP NOT NULL DEFAULT now()
);

-- Денормализованные счётчики на user_profiles
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "followers_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "following_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "feed_last_seen_at" TIMESTAMP;

-- GIN-индексы для полнотекстового поиска пользователей
CREATE INDEX IF NOT EXISTS "idx_users_username_tsvector"
  ON "users" USING GIN(to_tsvector('russian', "username"));

CREATE INDEX IF NOT EXISTS "idx_user_profiles_display_name_tsvector"
  ON "user_profiles" USING GIN(to_tsvector('russian', COALESCE("display_name", '')));

-- Вспомогательные индексы для фильтрации по типу и статусу
CREATE INDEX IF NOT EXISTS "idx_users_status_active"
  ON "users"("status") WHERE "status" = 'active';

CREATE INDEX IF NOT EXISTS "idx_user_profiles_is_reader"
  ON "user_profiles"("is_reader") WHERE "is_reader" = true;

CREATE INDEX IF NOT EXISTS "idx_users_status_role"
  ON "users"("status", "role") WHERE "status" = 'active';

-- Индекс для сортировки по популярности
CREATE INDEX IF NOT EXISTS "idx_user_profiles_followers_count"
  ON "user_profiles"("followers_count" DESC) WHERE "followers_count" > 0;
