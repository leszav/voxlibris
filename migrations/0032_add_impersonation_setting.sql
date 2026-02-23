-- Migration 0032: Add impersonation settings and admin action logs
-- Adds security settings for impersonation control and ensures admin_actions table exists
-- ИДЕМПОТЕНТНАЯ И БЕЗОПАСНАЯ МИГРАЦИЯ

-- =====================================================
-- БЕЗОПАСНОСТЬ: admin_actions table уже существует с миграции 0006
-- Проверяем только дополнительные индексы, которых может не быть
-- =====================================================

-- Добавляем дополнительные индексы для admin_actions (если их нет)
-- Базовые индексы уже созданы в миграции 0006
CREATE INDEX IF NOT EXISTS "admin_actions_action_type_idx" ON "admin_actions"("action_type");
CREATE INDEX IF NOT EXISTS "admin_actions_target_type_idx" ON "admin_actions"("target_type");
CREATE INDEX IF NOT EXISTS "admin_actions_target_id_idx" ON "admin_actions"("target_id");

-- Composite index for efficient filtering by action and date
CREATE INDEX IF NOT EXISTS "admin_actions_action_date_idx" ON "admin_actions"("action_type", "created_at" DESC);

-- Composite index for impersonation audit
CREATE INDEX IF NOT EXISTS "admin_actions_impersonate_idx" ON "admin_actions"("action_type", "admin_id", "created_at" DESC) 
  WHERE "action_type" = 'impersonate';

-- =====================================================
-- ИДЕМПОТЕНТНОСТЬ: Добавляем настройки безопасности
-- ON CONFLICT DO NOTHING гарантирует безопасность повторного запуска
-- =====================================================

-- Add security settings for impersonation control
INSERT INTO "settings" ("key", "value", "category", "description", "is_encrypted") VALUES 
  ('security.impersonation.enabled', 'true', 'security', 'Enable/disable admin impersonation feature', false),
  ('security.impersonation.log_retention_days', '90', 'security', 'Days to retain impersonation audit logs', false),
  ('security.admin_session_timeout', '60', 'security', 'Admin session timeout in minutes', false),
  ('security.failed_login_attempts_limit', '5', 'security', 'Maximum failed login attempts before account lockout', false),
  ('security.account_lockout_duration', '30', 'security', 'Account lockout duration in minutes', false)
ON CONFLICT ("key") DO NOTHING;

-- =====================================================
-- БЕЗОПАСНОСТЬ: Функция очистки создается, но НЕ запускается автоматически
-- Администратор должен настроить расписание вручную при необходимости
-- =====================================================

-- Add audit retention policy trigger function (безопасная версия)
CREATE OR REPLACE FUNCTION cleanup_old_admin_actions(dry_run boolean DEFAULT true)
RETURNS TABLE(would_delete_count bigint, retention_days_used integer) AS $$
DECLARE
  retention_days integer;
  delete_count bigint;
BEGIN
  -- Get retention period from settings
  SELECT COALESCE(s.value::integer, 90) INTO retention_days
  FROM settings s 
  WHERE s.key = 'security.impersonation.log_retention_days';
  
  -- Count records that would be deleted
  SELECT COUNT(*) INTO delete_count
  FROM admin_actions 
  WHERE created_at < NOW() - (retention_days || ' days')::interval;
  
  -- Only delete if explicitly requested (dry_run = false)
  IF NOT dry_run THEN
    DELETE FROM admin_actions 
    WHERE created_at < NOW() - (retention_days || ' days')::interval;
    
    -- Log cleanup action only when actually performed
    RAISE NOTICE 'DELETED % admin_actions older than % days', delete_count, retention_days;
  ELSE
    -- Dry run mode - just report what would be deleted
    RAISE NOTICE 'DRY RUN: Would delete % admin_actions older than % days', delete_count, retention_days;
  END IF;
  
  -- Return summary
  RETURN QUERY SELECT delete_count, retention_days;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ИДЕМПОТЕНТНОСТЬ: Создаем таблицу security_events
-- =====================================================

CREATE TABLE IF NOT EXISTS "security_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_type" text NOT NULL, -- 'failed_login', 'suspicious_access', 'privilege_escalation', etc.
  "user_id" varchar, -- Can be null for anonymous events
  "ip_address" text,
  "user_agent" text,
  "details" text, -- JSON string with event details
  "risk_level" text NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
  "resolved" boolean NOT NULL DEFAULT false,
  "resolved_by" varchar,
  "resolved_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Add foreign key constraints for security_events (идемпотентно)
DO $$ BEGIN
  ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN 
  -- Constraint already exists, skip silently
  NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "security_events" ADD CONSTRAINT "security_events_resolved_by_users_id_fk" 
    FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN 
  -- Constraint already exists, skip silently
  NULL;
END $$;

-- Add indexes for security_events (идемпотентно)
CREATE INDEX IF NOT EXISTS "security_events_event_type_idx" ON "security_events"("event_type");
CREATE INDEX IF NOT EXISTS "security_events_user_id_idx" ON "security_events"("user_id");
CREATE INDEX IF NOT EXISTS "security_events_risk_level_idx" ON "security_events"("risk_level");
CREATE INDEX IF NOT EXISTS "security_events_created_at_idx" ON "security_events"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "security_events_unresolved_idx" ON "security_events"("resolved", "created_at" DESC) 
  WHERE "resolved" = false;

-- =====================================================
-- ИНФОРМАЦИЯ: Автоматическая очистка отключена по соображениям безопасности
-- =====================================================

-- NOTE: Automatic cleanup via pg_cron is disabled for security reasons.
-- To enable automatic cleanup, run these commands manually after reviewing:
--
-- 1. Test the cleanup function first (dry run):
--    SELECT * FROM cleanup_old_admin_actions(true);
--
-- 2. If pg_cron is available and you want automatic cleanup:
--    CREATE EXTENSION IF NOT EXISTS pg_cron;
--    SELECT cron.schedule('cleanup-admin-actions', '0 2 * * *', 
--           'SELECT cleanup_old_admin_actions(false);');
--
-- 3. To manually cleanup old logs:
--    SELECT cleanup_old_admin_actions(false);

-- =====================================================
-- ВЕРИФИКАЦИЯ: Проверка успешности миграции
-- =====================================================

-- Verification and summary
SELECT 
  'Migration 0032 completed successfully!' as result,
  'Added impersonation security settings and enhanced audit system' as description,
  (
    SELECT COUNT(*) FROM information_schema.tables 
    WHERE table_name IN ('admin_actions', 'security_events') 
    AND table_schema = current_schema()
  ) as tables_verified,
  (
    SELECT COUNT(*) FROM settings 
    WHERE category = 'security'
  ) as security_settings_count,
  (
    SELECT COUNT(*) FROM information_schema.routines
    WHERE routine_name = 'cleanup_old_admin_actions'
    AND routine_schema = current_schema()
  ) as cleanup_function_created;

-- Final safety notice
DO $$ BEGIN
  RAISE NOTICE '=';
  RAISE NOTICE 'Migration 0032 completed SAFELY and IDEMPOTENTLY';
  RAISE NOTICE 'Impersonation security controls have been added';
  RAISE NOTICE 'Automatic log cleanup is DISABLED by default for security';
  RAISE NOTICE 'Use cleanup_old_admin_actions(false) to manually clean old logs';
  RAISE NOTICE '=';
END $$;
