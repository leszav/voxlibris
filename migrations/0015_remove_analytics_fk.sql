-- Migration: Remove foreign key constraints from analytics_events
-- Personal books exist in personal_books table, not in books table
-- This allows analytics events to reference any book

-- Remove foreign key constraint for book_id
DO $$ BEGIN
  ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_book_id_books_id_fk";
EXCEPTION WHEN OTHERS THEN null; END $$;

-- Remove foreign key constraint for club_id (optional - clubs should exist)
DO $$ BEGIN
  ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_club_id_clubs_id_fk";
EXCEPTION WHEN OTHERS THEN null; END $$;

-- Remove foreign key constraint for user_id (optional - users might be deleted)
DO $$ BEGIN
  ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN null; END $$;
