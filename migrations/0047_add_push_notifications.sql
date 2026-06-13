-- 0047_add_push_notifications.sql
-- Web Push subscriptions, settings and delivery log.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  auth text NOT NULL,
  p256dh text NOT NULL,
  user_agent text,
  device_name text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_idx
  ON push_subscriptions(user_id, endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx
  ON push_subscriptions(user_id, is_active);

CREATE TABLE IF NOT EXISTS push_notification_settings (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT false,
  email_enabled boolean NOT NULL DEFAULT true,
  session_started boolean NOT NULL DEFAULT true,
  session_reminder boolean NOT NULL DEFAULT true,
  club_discussion boolean NOT NULL DEFAULT false,
  mention_in_chat boolean NOT NULL DEFAULT true,
  dm_received boolean NOT NULL DEFAULT true,
  new_follower boolean NOT NULL DEFAULT false,
  streak_reminder boolean NOT NULL DEFAULT true,
  achievement_unlocked boolean NOT NULL DEFAULT true,
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start integer DEFAULT 23,
  quiet_hours_end integer DEFAULT 8,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_notification_log (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  sent_at timestamp NOT NULL DEFAULT now(),
  delivered_at timestamp,
  clicked_at timestamp,
  error_code text
);

CREATE INDEX IF NOT EXISTS push_notification_log_user_sent_idx
  ON push_notification_log(user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS push_notification_log_type_idx
  ON push_notification_log(type);
