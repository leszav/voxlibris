-- VoxLibris Upload System - Contexts and Collections

-- Indexes for existing upload_contexts table
CREATE INDEX IF NOT EXISTS "upload_contexts_user_id_idx" ON "upload_contexts"("user_id");
CREATE INDEX IF NOT EXISTS "upload_contexts_club_id_idx" ON "upload_contexts"("club_id");
CREATE INDEX IF NOT EXISTS "upload_contexts_type_idx" ON "upload_contexts"("type");

-- Indexes for existing book_collections table
CREATE INDEX IF NOT EXISTS "book_collections_upload_context_id_idx" ON "book_collections"("upload_context_id");

-- Indexes for existing book_collection_items table
CREATE INDEX IF NOT EXISTS "book_collection_items_collection_id_idx" ON "book_collection_items"("collection_id");
CREATE INDEX IF NOT EXISTS "book_collection_items_book_id_idx" ON "book_collection_items"("book_id");

-- Indexes for existing legal_acknowledgments table
CREATE INDEX IF NOT EXISTS "legal_acknowledgments_user_id_idx" ON "legal_acknowledgments"("user_id");
CREATE INDEX IF NOT EXISTS "legal_acknowledgments_upload_context_id_idx" ON "legal_acknowledgments"("upload_context_id");

-- Extend books table with upload context
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "upload_context_id" varchar REFERENCES "upload_contexts"("id") ON DELETE SET NULL;
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'private' NOT NULL CHECK (visibility IN ('private', 'club', 'public'));

CREATE INDEX IF NOT EXISTS "books_upload_context_id_idx" ON "books"("upload_context_id");
CREATE INDEX IF NOT EXISTS "books_visibility_idx" ON "books"("visibility");

-- Indexes for existing user_books_library table
CREATE INDEX IF NOT EXISTS "user_books_library_user_id_idx" ON "user_books_library"("user_id");
CREATE INDEX IF NOT EXISTS "user_books_library_book_id_idx" ON "user_books_library"("book_id");

-- Indexes for existing club_books_library table
CREATE INDEX IF NOT EXISTS "club_books_library_club_id_idx" ON "club_books_library"("club_id");
CREATE INDEX IF NOT EXISTS "club_books_library_book_id_idx" ON "club_books_library"("book_id");
