-- 0048_add_emotional_map.sql
-- Timestamped reactions and cached emotional maps for reading sessions.

ALTER TABLE session_reactions
  ADD COLUMN IF NOT EXISTS audio_timestamp_ms integer,
  ADD COLUMN IF NOT EXISTS chapter_number integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_reactions_audio_timestamp_ms_non_negative'
  ) THEN
    ALTER TABLE session_reactions
      ADD CONSTRAINT session_reactions_audio_timestamp_ms_non_negative
      CHECK (audio_timestamp_ms IS NULL OR audio_timestamp_ms >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_reactions_chapter_number_positive'
  ) THEN
    ALTER TABLE session_reactions
      ADD CONSTRAINT session_reactions_chapter_number_positive
      CHECK (chapter_number IS NULL OR chapter_number > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS session_reactions_session_audio_ts_idx
  ON session_reactions(session_id, audio_timestamp_ms)
  WHERE audio_timestamp_ms IS NOT NULL;

ALTER TABLE reading_sessions
  ADD COLUMN IF NOT EXISTS emotional_map_cache jsonb,
  ADD COLUMN IF NOT EXISTS emotional_map_built_at timestamp;

CREATE INDEX IF NOT EXISTS reading_sessions_emotional_map_built_idx
  ON reading_sessions(emotional_map_built_at)
  WHERE emotional_map_built_at IS NOT NULL;
