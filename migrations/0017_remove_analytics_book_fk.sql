-- Remove foreign key constraint from analytics_events.book_id
-- This allows tracking books from multiple sources (books, personalBooks, etc.)
ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "analytics_events_book_id_books_id_fk";
