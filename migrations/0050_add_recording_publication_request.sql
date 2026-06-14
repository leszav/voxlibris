-- 0050_add_recording_publication_request.sql
-- Разделяет техническую арбитражную запись эфира и запись, которую чтец запросил для модерации/публикации.

ALTER TABLE session_recordings
  ADD COLUMN IF NOT EXISTS publication_requested boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_session_recordings_publication_requested
  ON session_recordings(publication_requested);
