-- Add logical channel for club chat messages
-- Used by server/websocket-chat.ts and shared/schema.ts

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS channel varchar(64) NOT NULL DEFAULT 'general';
