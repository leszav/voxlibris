-- VoxLibris Upload System - Contexts and Collections

-- Upload Contexts (personal, club, reader)
CREATE TABLE "upload_contexts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL CHECK (type IN ('personal', 'club', 'reader')),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "club_id" varchar REFERENCES "clubs"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "upload_contexts_user_id_idx" ON "upload_contexts"("user_id");
CREATE INDEX "upload_contexts_club_id_idx" ON "upload_contexts"("club_id");
CREATE INDEX "upload_contexts_type_idx" ON "upload_contexts"("type");

-- Book Collections (series, cycles)
CREATE TABLE "book_collections" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "upload_context_id" varchar NOT NULL REFERENCES "upload_contexts"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "book_collections_upload_context_id_idx" ON "book_collections"("upload_context_id");

-- Book Collection Items (many-to-many)
CREATE TABLE "book_collection_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collection_id" varchar NOT NULL REFERENCES "book_collections"("id") ON DELETE CASCADE,
  "book_id" varchar NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "position" integer DEFAULT 1 NOT NULL,
  "added_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE("collection_id", "book_id")
);

CREATE INDEX "book_collection_items_collection_id_idx" ON "book_collection_items"("collection_id");
CREATE INDEX "book_collection_items_book_id_idx" ON "book_collection_items"("book_id");

-- Legal Acknowledgments
CREATE TABLE "legal_acknowledgments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "upload_context_id" varchar NOT NULL REFERENCES "upload_contexts"("id") ON DELETE CASCADE,
  "ip_address" text NOT NULL,
  "user_agent" text,
  "acknowledged_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "legal_acknowledgments_user_id_idx" ON "legal_acknowledgments"("user_id");
CREATE INDEX "legal_acknowledgments_upload_context_id_idx" ON "legal_acknowledgments"("upload_context_id");

-- Extend books table with upload context
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "upload_context_id" varchar REFERENCES "upload_contexts"("id") ON DELETE SET NULL;
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'private' NOT NULL CHECK (visibility IN ('private', 'club', 'public'));

CREATE INDEX "books_upload_context_id_idx" ON "books"("upload_context_id");
CREATE INDEX "books_visibility_idx" ON "books"("visibility");

-- User Books Library - link users to books table (different from existing personal_books)
CREATE TABLE IF NOT EXISTS "user_books_library" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "book_id" varchar NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "added_at" timestamp DEFAULT now() NOT NULL,
  "last_read_at" timestamp,
  UNIQUE("user_id", "book_id")
);

CREATE INDEX "user_books_library_user_id_idx" ON "user_books_library"("user_id");
CREATE INDEX "user_books_library_book_id_idx" ON "user_books_library"("book_id");

-- Club Books Library - link clubs to books table (different from existing club_books)
CREATE TABLE IF NOT EXISTS "club_books_library" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "club_id" varchar NOT NULL REFERENCES "clubs"("id") ON DELETE CASCADE,
  "book_id" varchar NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "added_by" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "added_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE("club_id", "book_id")
);

CREATE INDEX "club_books_library_club_id_idx" ON "club_books_library"("club_id");
CREATE INDEX "club_books_library_book_id_idx" ON "club_books_library"("book_id");
