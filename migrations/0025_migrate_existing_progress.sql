-- Migration 0025: Migrate existing reading progress to book_reading_status
-- Миграция существующих данных из reading_progress в book_reading_status
-- 
-- ВАЖНО: Эта миграция зависит от миграции 0024_add_reading_status_tracking.sql
-- Убедитесь, что миграция 0024 выполнена ДО запуска этой миграции!
-- Иначе получите ошибку: relation "book_reading_status" does not exist

BEGIN;

-- Вставляем записи из reading_progress в book_reading_status
-- Группируем по пользователю и книге, берем максимальный прогресс
INSERT INTO book_reading_status (user_id, book_id, book_type, status, progress, started_at, completed_at, created_at, updated_at)
SELECT 
  rp.user_id,
  rp.book_id,
  CASE 
    WHEN rp.club_id IS NOT NULL THEN 'club'
    ELSE 'personal'
  END AS book_type,
  CASE 
    WHEN MAX(rp.progress) = 100 THEN 'completed'
    ELSE 'reading'
  END AS status,
  MAX(rp.progress) AS progress,
  MIN(rp.created_at) AS started_at,
  CASE 
    WHEN MAX(rp.progress) = 100 THEN MAX(rp.last_read_at)
    ELSE NULL
  END AS completed_at,
  MIN(rp.created_at) AS created_at,
  MAX(rp.updated_at) AS updated_at
FROM reading_progress rp
WHERE rp.progress > 0
GROUP BY rp.user_id, rp.book_id, CASE WHEN rp.club_id IS NOT NULL THEN 'club' ELSE 'personal' END
ON CONFLICT (user_id, book_id, book_type) DO UPDATE SET
  status = CASE 
    WHEN EXCLUDED.progress = 100 THEN 'completed'
    ELSE book_reading_status.status
  END,
  progress = GREATEST(book_reading_status.progress, EXCLUDED.progress),
  completed_at = CASE 
    WHEN EXCLUDED.progress = 100 AND book_reading_status.completed_at IS NULL 
    THEN EXCLUDED.completed_at
    ELSE book_reading_status.completed_at
  END,
  updated_at = NOW();

COMMIT;

-- Информация о миграции
SELECT 'Migration 0025 completed: Migrated ' || COUNT(DISTINCT (user_id, book_id, CASE WHEN club_id IS NOT NULL THEN 'club' ELSE 'personal' END)) || ' reading progress records to book_reading_status' 
FROM reading_progress 
WHERE progress > 0;
