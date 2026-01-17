-- Добавляем индексы производительности для админских таблиц
-- Таблицы уже существуют, добавляем только недостающие индексы для оптимизации

-- Индексы для moderation_reports (критично для админ-панели)
CREATE INDEX IF NOT EXISTS "idx_moderation_reports_status" ON "moderation_reports" ("status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_moderation_reports_type_target" ON "moderation_reports" ("type", "target_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_moderation_reports_reporter_created" ON "moderation_reports" ("reporter_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_moderation_reports_assigned_to" ON "moderation_reports" ("assigned_to") WHERE "assigned_to" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_moderation_reports_priority_status" ON "moderation_reports" ("priority", "status");
--> statement-breakpoint

-- Индексы для admin_actions (логирование администраторских действий)
CREATE INDEX IF NOT EXISTS "idx_admin_actions_admin_created" ON "admin_actions" ("admin_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_admin_actions_target" ON "admin_actions" ("target_type", "target_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_admin_actions_action_type" ON "admin_actions" ("action_type");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_admin_actions_created_at" ON "admin_actions" ("created_at");
--> statement-breakpoint

-- Индексы для system_settings (системные настройки)
CREATE INDEX IF NOT EXISTS "idx_system_settings_category" ON "system_settings" ("category");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_system_settings_public" ON "system_settings" ("is_public");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_system_settings_updated_at" ON "system_settings" ("updated_at");