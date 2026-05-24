-- Clean Rebuild Script
-- Drops ALL tables and recreates a fresh database
-- WARNING: This will destroy all data!

-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS "analytics_events" CASCADE;
DROP TABLE IF EXISTS "legal_acknowledgments" CASCADE;
DROP TABLE IF EXISTS "book_collection_items" CASCADE;
DROP TABLE IF EXISTS "book_collections" CASCADE;
DROP TABLE IF EXISTS "club_books" CASCADE;
DROP TABLE IF EXISTS "personal_books" CASCADE;
DROP TABLE IF EXISTS "upload_contexts" CASCADE;
DROP TABLE IF EXISTS "notes" CASCADE;
DROP TABLE IF EXISTS "bookmarks" CASCADE;
DROP TABLE IF EXISTS "settings" CASCADE;
DROP TABLE IF EXISTS "system_settings" CASCADE;
DROP TABLE IF EXISTS "moderation_reports" CASCADE;
DROP TABLE IF EXISTS "admin_actions" CASCADE;
DROP TABLE IF EXISTS "user_profiles" CASCADE;
DROP TABLE IF EXISTS "reader_ratings" CASCADE;
DROP TABLE IF EXISTS "session_listeners" CASCADE;
DROP TABLE IF EXISTS "reading_history" CASCADE;
DROP TABLE IF EXISTS "reading_progress" CASCADE;
DROP TABLE IF EXISTS "reading_sessions" CASCADE;
DROP TABLE IF EXISTS "club_invitations" CASCADE;
DROP TABLE IF EXISTS "club_tags" CASCADE;
DROP TABLE IF EXISTS "club_members" CASCADE;
DROP TABLE IF EXISTS "clubs" CASCADE;
DROP TABLE IF EXISTS "book_content" CASCADE;
DROP TABLE IF EXISTS "books" CASCADE;
DROP TABLE IF EXISTS "refresh_tokens" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- Drop all custom types if any exist
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
    LOOP
        EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END $$;

-- Drop all sequences
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = current_schema()
    LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequencename) || ' CASCADE';
    END LOOP;
END $$;

-- Drop all functions
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT proname, oidvectortypes(proargtypes) as args
             FROM pg_proc 
             WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
    END LOOP;
END $$;

-- Verify cleanup
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'Database successfully cleaned - ready for fresh migration!'
        ELSE 'Warning: ' || COUNT(*)::text || ' tables still exist'
    END as cleanup_status
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

SELECT 'Run migrations 0000-0010 in order to rebuild the complete schema.' as next_step;