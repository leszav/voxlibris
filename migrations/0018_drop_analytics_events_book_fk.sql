-- Migration 0018: Drop analytics_events book_id/user_id/club_id FKs (allow personal/club book ids)

DO $$ BEGIN
  ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_book_id_fk";
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_book_id_books_id_fk";
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_club_id_fk";
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_club_id_clubs_id_fk";
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_user_id_fk";
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_user_id_users_id_fk";
EXCEPTION WHEN OTHERS THEN null; END $$;
