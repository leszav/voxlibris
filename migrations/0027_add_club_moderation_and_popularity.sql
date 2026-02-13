-- Migration 0027: Add Club Moderation and Popularity Scoring
-- Date: 2026-02-12
-- Purpose: 
--   1. Add 'pending' status for club moderation
--   2. Add popularity_score field for intelligent sorting
--   3. Prevent new clubs from immediately appearing in TOP popular clubs

-- 1. Add popularity_score column to clubs table
-- This field will store a calculated popularity score based on:
--   - Member count
--   - Activity (reading sessions, messages)
--   - Club age (new clubs get penalty)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'clubs' 
    AND column_name = 'popularity_score'
  ) THEN
    ALTER TABLE clubs ADD COLUMN popularity_score INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added popularity_score column to clubs table';
  ELSE
    RAISE NOTICE 'popularity_score column already exists in clubs table';
  END IF;
END$$;

-- 2. Create indexes for efficient sorting and filtering
-- Index for sorting by popularity (will be used in catalog)
CREATE INDEX IF NOT EXISTS idx_clubs_popularity_score ON clubs(popularity_score DESC);

-- Combined index for sorting by popularity + creation date
CREATE INDEX IF NOT EXISTS idx_clubs_popularity_created ON clubs(popularity_score DESC, created_at DESC);

-- Note: Index on status already exists from migration 0002_clubs_and_members.sql (line 53)
-- So we don't create it again to avoid conflicts

-- 3. Add comment explaining the new field
COMMENT ON COLUMN clubs.popularity_score IS 'Calculated popularity score based on member count, activity, and age. Used for sorting clubs in catalog. Updated periodically by cron job.';

-- 4. Initialize existing clubs with popularity_score = 0
-- The actual score will be calculated by the ClubPopularityService cron job
UPDATE clubs SET popularity_score = 0 WHERE popularity_score IS NULL;

-- 5. Verification
DO $$
DECLARE
  column_exists BOOLEAN;
  index_exists BOOLEAN;
  clubs_count INTEGER;
  clubs_with_score INTEGER;
BEGIN
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'clubs' 
    AND column_name = 'popularity_score'
  ) INTO column_exists;

  -- Check if main index exists
  SELECT EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE tablename = 'clubs' 
    AND indexname = 'idx_clubs_popularity_score'
  ) INTO index_exists;

  -- Count clubs
  SELECT COUNT(*) INTO clubs_count FROM clubs;
  SELECT COUNT(*) INTO clubs_with_score FROM clubs WHERE popularity_score IS NOT NULL;

  IF column_exists AND index_exists THEN
    RAISE NOTICE 'Migration 0027 applied successfully:';
    RAISE NOTICE '  - popularity_score column added to clubs table';
    RAISE NOTICE '  - Indexes created for efficient sorting';
    RAISE NOTICE '  - % existing clubs initialized with popularity_score = 0', clubs_count;
    RAISE NOTICE '  - % clubs have popularity_score set', clubs_with_score;
    RAISE NOTICE 'Note: Status "pending" is now available in schema for club moderation';
    RAISE NOTICE 'Note: ClubPopularityService will calculate actual scores via cron job';
  ELSE
    RAISE WARNING 'Migration 0027 may not be fully applied';
  END IF;
END$$;
