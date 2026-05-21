-- Migration 0044: Gamification MVP

-- Достижения (управляются из админки)
CREATE TABLE IF NOT EXISTS "achievements" (
  "id"                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"              VARCHAR(100) NOT NULL UNIQUE,
  "title_ru"          VARCHAR(120) NOT NULL,
  "description_ru"    TEXT,
  "icon_type"         VARCHAR(30) NOT NULL DEFAULT 'badge',
  "badge_image_url"   TEXT,
  "reward_payload"    JSONB,
  "conditions_payload" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status"            VARCHAR(20) NOT NULL DEFAULT 'draft',
  "sort_order"        INTEGER NOT NULL DEFAULT 0,
  "created_by"        VARCHAR REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by"        VARCHAR REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "achievements_status_check" CHECK ("status" IN ('draft', 'active', 'archived')),
  CONSTRAINT "achievements_icon_type_check" CHECK ("icon_type" IN ('badge', 'star', 'title'))
);
CREATE INDEX IF NOT EXISTS "idx_achievements_status_sort" ON "achievements"("status", "sort_order", "created_at" DESC);

-- Кирпичики конструктора (управляются из админки)
CREATE TABLE IF NOT EXISTS "achievement_building_blocks" (
  "id"                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"                VARCHAR(100) NOT NULL UNIQUE,
  "label_ru"            VARCHAR(120) NOT NULL,
  "value_type"          VARCHAR(20) NOT NULL,
  "supported_operators" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "is_active"           BOOLEAN NOT NULL DEFAULT true,
  "created_by"          VARCHAR REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by"          VARCHAR REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "achievement_building_blocks_value_type_check" CHECK ("value_type" IN ('number', 'string', 'boolean'))
);
CREATE INDEX IF NOT EXISTS "idx_achievement_blocks_active" ON "achievement_building_blocks"("is_active", "created_at" DESC);

-- Выданные достижения пользователям
CREATE TABLE IF NOT EXISTS "user_achievements" (
  "id"             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"        VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "achievement_id" VARCHAR NOT NULL REFERENCES "achievements"("id") ON DELETE CASCADE,
  "awarded_at"     TIMESTAMP NOT NULL DEFAULT now(),
  "awarded_by"     VARCHAR REFERENCES "users"("id") ON DELETE SET NULL,
  "meta"           JSONB,
  CONSTRAINT "user_achievements_unique" UNIQUE ("user_id", "achievement_id")
);
CREATE INDEX IF NOT EXISTS "idx_user_achievements_user_awarded" ON "user_achievements"("user_id", "awarded_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_user_achievements_achievement" ON "user_achievements"("achievement_id");

-- Счётчики активности пользователя для вычисления достижений
CREATE TABLE IF NOT EXISTS "user_activity_counters" (
  "user_id"                      VARCHAR PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "completed_books_count"        INTEGER NOT NULL DEFAULT 0,
  "sent_dm_count"                INTEGER NOT NULL DEFAULT 0,
  "following_count_snapshot"     INTEGER NOT NULL DEFAULT 0,
  "followers_count_snapshot"     INTEGER NOT NULL DEFAULT 0,
  "club_sessions_joined_count"   INTEGER NOT NULL DEFAULT 0,
  "updated_at"                   TIMESTAMP NOT NULL DEFAULT now()
);

-- Стрики пользователя
CREATE TABLE IF NOT EXISTS "user_streaks" (
  "user_id"             VARCHAR PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "current_streak_days" INTEGER NOT NULL DEFAULT 0,
  "best_streak_days"    INTEGER NOT NULL DEFAULT 0,
  "last_active_date"    TEXT,
  "updated_at"          TIMESTAMP NOT NULL DEFAULT now()
);

-- Галерея ассетов наград (бейджи/звезды/титулы)
CREATE TABLE IF NOT EXISTS "achievement_reward_assets" (
  "id"             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "asset_type"     VARCHAR(20) NOT NULL,
  "name_ru"        VARCHAR(120) NOT NULL,
  "image_url"      TEXT NOT NULL,
  "description_ru" TEXT,
  "group_key"      VARCHAR(80) NOT NULL DEFAULT 'default',
  "tags"           JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sort_order"     INTEGER NOT NULL DEFAULT 0,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_by"     VARCHAR REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by"     VARCHAR REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"     TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "achievement_reward_assets_type_check" CHECK ("asset_type" IN ('badge', 'star', 'title')),
  CONSTRAINT "achievement_reward_assets_unique" UNIQUE ("asset_type", "image_url")
);
CREATE INDEX IF NOT EXISTS "idx_reward_assets_type_active_sort" ON "achievement_reward_assets"("asset_type", "is_active", "sort_order", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_reward_assets_group" ON "achievement_reward_assets"("group_key", "asset_type");

-- Этап 2: Динамическая система условий (май 2026)
-- Добавляем маппинг кода параметра на путь в БД для универсального резолвера
ALTER TABLE "achievement_building_blocks"
  ADD COLUMN IF NOT EXISTS "source_key" VARCHAR(200);

-- Заполняем source_key для известных встроенных параметров
UPDATE "achievement_building_blocks" 
SET "source_key" = 'derived.tenure_days' 
WHERE "code" = 'tenure_days' AND "source_key" IS NULL;

UPDATE "achievement_building_blocks" 
SET "source_key" = 'user_activity_counters.completed_books_count' 
WHERE "code" = 'completed_books' AND "source_key" IS NULL;

UPDATE "achievement_building_blocks" 
SET "source_key" = 'user_activity_counters.sent_dm_count' 
WHERE "code" = 'sent_dm_count' AND "source_key" IS NULL;

UPDATE "achievement_building_blocks" 
SET "source_key" = 'user_profiles.profile_completed' 
WHERE "code" = 'profile_completed' AND "source_key" IS NULL;

UPDATE "achievement_building_blocks" 
SET "source_key" = 'users.role' 
WHERE "code" = 'role' AND "source_key" IS NULL;

UPDATE "achievement_building_blocks" 
SET "source_key" = 'user_streaks.current_streak_days' 
WHERE "code" = 'current_streak_days' AND "source_key" IS NULL;

UPDATE "achievement_building_blocks" 
SET "source_key" = 'user_activity_counters.following_count_snapshot' 
WHERE "code" = 'following_count' AND "source_key" IS NULL;

UPDATE "achievement_building_blocks" 
SET "source_key" = 'user_activity_counters.followers_count_snapshot' 
WHERE "code" = 'followers_count' AND "source_key" IS NULL;

-- Для новых кодов админ должен заполнить source_key вручную
-- Если source_key остался NULL, резолвер вернёт null при вычислении
