-- Create chat messages table
-- Used by server/websocket-chat.ts and shared/schema.ts

CREATE TABLE IF NOT EXISTS chat_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id varchar NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  channel varchar(64) NOT NULL DEFAULT 'general',
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text text NOT NULL,
  mentions text, -- JSON array of mentioned user IDs
  attachments text, -- JSON array of attachment metadata
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp NULL
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_club_channel ON chat_messages(club_id, channel);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
