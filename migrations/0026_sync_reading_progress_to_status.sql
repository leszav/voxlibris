-- Migration 0026: Sync reading_progress with book_reading_status
-- Синхронизация reading_progress с book_reading_status
-- Создаем записи в book_reading_status для всех книг из reading_progress, которых там нет
-- 
-- ВАЖНО: Зависит от миграции 0024_add_reading_status_tracking.sql
-- Выполняйте миграции по порядку: 0024 → 0025 → 0026

INSERT INTO book_reading_status (
  user_id,
  book_id,
  book_type,
  status,
  progress,
  started_at,
  completed_at,
  created_at,
  updated_at
)
SELECT 
  rp.user_id,
  rp.book_id,
  CASE 
    WHEN rp.club_id IS NOT NULL THEN 'club'
    ELSE 'personal'
  END as book_type,
  CASE 
    WHEN rp.progress >= 100 THEN 'completed'
    ELSE 'reading'
  END as status,
  rp.progress,
  rp.created_at as started_at,
  CASE 
    WHEN rp.progress >= 100 THEN rp.last_read_at
    ELSE NULL
  END as completed_at,
  rp.created_at,
  rp.updated_at
FROM reading_progress rp
WHERE NOT EXISTS (
  SELECT 1 
  FROM book_reading_status brs 
  WHERE brs.user_id = rp.user_id 
    AND brs.book_id = rp.book_id
    AND brs.book_type = CASE 
      WHEN rp.club_id IS NOT NULL THEN 'club'
      ELSE 'personal'
    END
)
-- Проверяем, что книга существует (personal или club)
AND (
  EXISTS (SELECT 1 FROM personal_books pb WHERE pb.id = rp.book_id AND rp.club_id IS NULL)
  OR
  EXISTS (SELECT 1 FROM club_books cb WHERE cb.id = rp.book_id AND rp.club_id IS NOT NULL)
);
