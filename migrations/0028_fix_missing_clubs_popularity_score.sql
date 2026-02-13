-- Migration 0028: Compatibility fix for missing clubs.popularity_score
-- Date: 2026-02-13
-- Purpose:
--   Safely add clubs.popularity_score in environments where app code was updated
--   but migration 0027 was not applied (or was partially applied).
-- Safety:
--   - Idempotent (can be re-run)
--   - Does not fail if clubs table is absent
--   - Creates required indexes only when missing

DO $$
BEGIN
  IF to_regclass('public.clubs') IS NULL THEN
    RAISE NOTICE 'Table public.clubs does not exist. Skipping migration 0028.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clubs'
      AND column_name = 'popularity_score'
  ) THEN
    ALTER TABLE public.clubs
      ADD COLUMN popularity_score INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added public.clubs.popularity_score';
  ELSE
    RAISE NOTICE 'public.clubs.popularity_score already exists';
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('public.clubs') IS NULL THEN
    RETURN;
  END IF;

  -- Defensive backfill in case column existed but had nullable rows from manual changes
  EXECUTE 'UPDATE public.clubs SET popularity_score = 0 WHERE popularity_score IS NULL';
END$$;

CREATE INDEX IF NOT EXISTS idx_clubs_popularity_score
  ON public.clubs (popularity_score DESC);

CREATE INDEX IF NOT EXISTS idx_clubs_popularity_created
  ON public.clubs (popularity_score DESC, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.clubs') IS NULL THEN
    RETURN;
  END IF;

  COMMENT ON COLUMN public.clubs.popularity_score
    IS 'Calculated popularity score based on member count, activity, and age. Used for sorting clubs in catalog.';
END$$;
