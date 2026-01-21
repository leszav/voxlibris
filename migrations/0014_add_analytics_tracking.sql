-- Migration: Add analytics tracking improvements
-- Ensures proper tracking of book completions and reading sessions

-- Add composite index for book completion queries (used in KPI calculation)
CREATE INDEX IF NOT EXISTS "analytics_events_book_complete_idx" ON "analytics_events"("book_id", "event_type", "created_at")
WHERE event_type = 'book_complete';

-- Add index for reading sessions with club context
CREATE INDEX IF NOT EXISTS "analytics_events_club_reading_idx" ON "analytics_events"("club_id", "event_type", "created_at")
WHERE club_id IS NOT NULL;

-- Add index for user reading activity tracking
CREATE INDEX IF NOT EXISTS "analytics_events_user_reading_idx" ON "analytics_events"("user_id", "event_type", "created_at")
WHERE user_id IS NOT NULL;
