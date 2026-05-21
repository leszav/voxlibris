-- Migration 0043: Direct messages — conversations, messages, unread counters

-- Диалоги (пара пользователей, упорядоченная для исключения дублей)
CREATE TABLE IF NOT EXISTS "conversations" (
  "id"              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "participant_a"   VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "participant_b"   VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_message_at" TIMESTAMP,
  "last_message_id" VARCHAR,
  "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "conversations_unique_pair" UNIQUE ("participant_a", "participant_b"),
  CONSTRAINT "conversations_ordered" CHECK ("participant_a" < "participant_b"),
  CONSTRAINT "conversations_no_self" CHECK ("participant_a" != "participant_b")
);
CREATE INDEX IF NOT EXISTS "idx_conversations_a"    ON "conversations"("participant_a");
CREATE INDEX IF NOT EXISTS "idx_conversations_b"    ON "conversations"("participant_b");
CREATE INDEX IF NOT EXISTS "idx_conversations_last" ON "conversations"("last_message_at" DESC NULLS LAST);

-- Сообщения
CREATE TABLE IF NOT EXISTS "direct_messages" (
  "id"              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" VARCHAR NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "sender_id"       VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body"            TEXT NOT NULL,
  "is_deleted"      BOOLEAN NOT NULL DEFAULT false,
  "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
  "read_at"         TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_dm_conversation" ON "direct_messages"("conversation_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_dm_sender"        ON "direct_messages"("sender_id");

-- Счётчики непрочитанных (по одной строке на участника диалога)
CREATE TABLE IF NOT EXISTS "conversation_unread" (
  "conversation_id" VARCHAR NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "user_id"         VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "unread_count"    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("conversation_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "idx_conv_unread_user" ON "conversation_unread"("user_id");

-- Жалобы на сообщения
CREATE TABLE IF NOT EXISTS "dm_reports" (
  "id"             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id"     VARCHAR NOT NULL REFERENCES "direct_messages"("id") ON DELETE CASCADE,
  "reporter_id"    VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category"       VARCHAR NOT NULL,   -- spam | harassment | threats | other
  "comment"        TEXT,
  "status"         VARCHAR NOT NULL DEFAULT 'pending',  -- pending | reviewed | dismissed
  "reviewed_by"    VARCHAR REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at"    TIMESTAMP,
  "created_at"     TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "dm_reports_category_check" CHECK ("category" IN ('spam', 'harassment', 'threats', 'other')),
  CONSTRAINT "dm_reports_status_check"   CHECK ("status"   IN ('pending', 'reviewed', 'dismissed')),
  CONSTRAINT "dm_reports_unique"         UNIQUE ("message_id", "reporter_id")
);
CREATE INDEX IF NOT EXISTS "idx_dm_reports_status"     ON "dm_reports"("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_dm_reports_reporter"   ON "dm_reports"("reporter_id");
CREATE INDEX IF NOT EXISTS "idx_dm_reports_reviewer"   ON "dm_reports"("reviewed_by");

-- Аудит-лог доступа администраторов к ЛС (только чтение, только по жалобе)
CREATE TABLE IF NOT EXISTS "dm_admin_access_log" (
  "id"              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id"        VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "conversation_id" VARCHAR NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "report_id"       VARCHAR REFERENCES "dm_reports"("id") ON DELETE SET NULL,
  "reason"          TEXT NOT NULL,
  "accessed_at"     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_dm_admin_log_admin" ON "dm_admin_access_log"("admin_id");
CREATE INDEX IF NOT EXISTS "idx_dm_admin_log_conv"  ON "dm_admin_access_log"("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_dm_admin_log_time"  ON "dm_admin_access_log"("accessed_at" DESC);

-- Системные уведомления пользователей
-- Примечание: FK на "comments" намеренно опущен — таблица comments ещё не создана.
-- source_comment_id будет использоваться как plain VARCHAR до создания таблицы comments.
CREATE TABLE IF NOT EXISTS "notifications" (
  "id"                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"           VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type"              VARCHAR(20) NOT NULL,
  "source_comment_id" VARCHAR,
  "source_user_id"    VARCHAR REFERENCES "users"("id") ON DELETE SET NULL,
  "source_message_id" VARCHAR REFERENCES "chat_messages"("id") ON DELETE SET NULL,
  "message"           TEXT NOT NULL,
  "read_at"           TIMESTAMP,
  "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_type_check" CHECK ("type" IN (
    'message', 'mention', 'reply', 'new_follower',
    'session_start', 'session_end', 'new_question',
    'chapter_ready', 'plan_update', 'achievement'
  ))
);
CREATE INDEX IF NOT EXISTS "idx_notifications_user"    ON "notifications"("user_id", "read_at", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_notifications_unread"  ON "notifications"("user_id") WHERE "read_at" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Расширение notifications: колонки для системы in-app оповещений (bell)
-- ─────────────────────────────────────────────────────────────────────────────

-- fine-grained вид события (например: followed_you, club_discussion_reply)
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(60);

-- кто совершил действие (может быть NULL для системных уведомлений)
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "actor_user_id" VARCHAR
  REFERENCES "users"("id") ON DELETE SET NULL;

-- тип связанной сущности (conversation, club, comment, user, ...)
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entity_type" VARCHAR(40);

-- ID связанной сущности
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entity_id" VARCHAR;

-- URL перехода по клику (рассчитывается при вставке для кэша или на лету)
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "action_url" TEXT;

-- произвольные данные для presentOne/presentMany (JSON)
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "payload" JSONB;

-- индекс для быстрой группировки непрочитанных по пользователю + kind
CREATE INDEX IF NOT EXISTS "idx_notifications_bell"
  ON "notifications"("user_id", "kind", "created_at" DESC)
  WHERE "read_at" IS NULL;
