-- Migration 0001: Books and Content System
-- Core book management and content structure

-- Books table - main book catalog
CREATE TABLE IF NOT EXISTS "books" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "author" text NOT NULL,
  "cover_url" text,
  "description" text,
  "isbn" text,
  "language" text,
  "publisher" text,
  "publish_date" text,
  "status" text DEFAULT 'active' NOT NULL,
  "blocked_at" timestamp,
  "block_reason" text,
  "download_count" integer DEFAULT 0,
  "total_chapters" integer DEFAULT 1,
  "content_type" text DEFAULT 'text',
  "content_path" text,
  "original_filename" text,
  "file_size" integer,
  "uploaded_by" varchar,
  "uploaded_at" timestamp,
  "content_hash" varchar(64),
  "word_count" integer DEFAULT 0,
  "processing_status" text DEFAULT 'pending',
  "upload_context_id" varchar,
  "visibility" text DEFAULT 'private' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Book content - chapters and sections
CREATE TABLE IF NOT EXISTS "book_content" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "book_id" varchar NOT NULL,
  "chapter_number" integer NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "word_count" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "books" ADD CONSTRAINT "books_uploaded_by_fk" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "book_content" ADD CONSTRAINT "book_content_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "books_author_idx" ON "books"("author");
CREATE INDEX IF NOT EXISTS "books_status_idx" ON "books"("status");
CREATE INDEX IF NOT EXISTS "books_visibility_idx" ON "books"("visibility");
CREATE INDEX IF NOT EXISTS "books_upload_context_id_idx" ON "books"("upload_context_id");
CREATE INDEX IF NOT EXISTS "book_content_book_id_idx" ON "book_content"("book_id");
CREATE INDEX IF NOT EXISTS "book_content_chapter_idx" ON "book_content"("book_id", "chapter_number");