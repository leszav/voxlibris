-- Migration 0034: Deduplicate reading_progress and enforce uniqueness
-- Безопасно удаляет дубликаты прогресса и ставит уникальные индексы
-- отдельно для personal (club_id IS NULL) и club (club_id IS NOT NULL) записей.

WITH ranked_progress AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, book_id, club_id
      ORDER BY
        updated_at DESC,
        last_read_at DESC,
        created_at DESC,
        progress DESC,
        current_chapter DESC,
        id DESC
    ) AS row_num
  FROM reading_progress
),
duplicate_progress AS (
  SELECT id
  FROM ranked_progress
  WHERE row_num > 1
)
DELETE FROM reading_progress
WHERE id IN (SELECT id FROM duplicate_progress);

CREATE UNIQUE INDEX IF NOT EXISTS reading_progress_personal_unique_idx
  ON reading_progress (user_id, book_id)
  WHERE club_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reading_progress_club_unique_idx
  ON reading_progress (user_id, book_id, club_id)
  WHERE club_id IS NOT NULL;
