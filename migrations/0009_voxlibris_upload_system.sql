-- Migration 0009: VoxLibris Upload System
-- File upload contexts and personal/club book libraries

-- Upload contexts for file management
CREATE TABLE IF NOT EXISTS "upload_contexts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" text NOT NULL,
  "user_id" varchar NOT NULL,
  "club_id" varchar,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Personal books library
CREATE TABLE IF NOT EXISTS "personal_books" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "title" text NOT NULL,
  "author" text NOT NULL,
  "description" text,
  "publication_year" integer,
  "genre" text,
  "language" text,
  "format" text NOT NULL,
  "file_hash" varchar(64),
  "file_size_bytes" integer,
  "storage_path" text NOT NULL,
  "encrypted_content_key" text,
  "cover_url" text,
  "uploaded_at" timestamp DEFAULT now() NOT NULL,
  "is_deleted" boolean DEFAULT false NOT NULL,
  "soft_deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Club books library
CREATE TABLE IF NOT EXISTS "club_books" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_id" varchar NOT NULL,
  "uploaded_by_user_id" varchar NOT NULL,
  "title" text NOT NULL,
  "author" text NOT NULL,
  "description" text,
  "publication_year" integer,
  "genre" text,
  "language" text,
  "format" text NOT NULL,
  "file_hash" varchar(64),
  "file_size_bytes" integer,
  "storage_path" text NOT NULL,
  "encrypted_content_key" text,
  "cover_url" text,
  "recommended_reading_order" integer,
  "uploaded_at" timestamp DEFAULT now() NOT NULL,
  "is_deleted" boolean DEFAULT false NOT NULL,
  "soft_deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Book collections for organizing uploads
CREATE TABLE IF NOT EXISTS "book_collections" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text,
  "upload_context_id" varchar NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Book collection items
CREATE TABLE IF NOT EXISTS "book_collection_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "collection_id" varchar NOT NULL,
  "book_id" varchar NOT NULL,
  "position" integer DEFAULT 1 NOT NULL,
  "added_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "upload_contexts" ADD CONSTRAINT "upload_contexts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "upload_contexts" ADD CONSTRAINT "upload_contexts_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "personal_books" ADD CONSTRAINT "personal_books_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_books" ADD CONSTRAINT "club_books_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_books" ADD CONSTRAINT "club_books_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "book_collections" ADD CONSTRAINT "book_collections_upload_context_id_fk" FOREIGN KEY ("upload_context_id") REFERENCES "upload_contexts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "book_collection_items" ADD CONSTRAINT "book_collection_items_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "book_collections"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "book_collection_items" ADD CONSTRAINT "book_collection_items_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add upload_context_id foreign key to books table
DO $$ BEGIN
  ALTER TABLE "books" ADD CONSTRAINT "books_upload_context_fk" FOREIGN KEY ("upload_context_id") REFERENCES "upload_contexts"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "upload_contexts_user_id_idx" ON "upload_contexts"("user_id");
CREATE INDEX IF NOT EXISTS "upload_contexts_club_id_idx" ON "upload_contexts"("club_id");
CREATE INDEX IF NOT EXISTS "upload_contexts_type_idx" ON "upload_contexts"("type");
CREATE INDEX IF NOT EXISTS "personal_books_user_id_idx" ON "personal_books"("user_id");
CREATE INDEX IF NOT EXISTS "personal_books_title_idx" ON "personal_books"("title");
CREATE INDEX IF NOT EXISTS "personal_books_author_idx" ON "personal_books"("author");
CREATE INDEX IF NOT EXISTS "personal_books_is_deleted_idx" ON "personal_books"("is_deleted");
CREATE INDEX IF NOT EXISTS "club_books_club_id_idx" ON "club_books"("club_id");
CREATE INDEX IF NOT EXISTS "club_books_uploaded_by_user_id_idx" ON "club_books"("uploaded_by_user_id");
CREATE INDEX IF NOT EXISTS "club_books_title_idx" ON "club_books"("title");
CREATE INDEX IF NOT EXISTS "club_books_author_idx" ON "club_books"("author");
CREATE INDEX IF NOT EXISTS "club_books_is_deleted_idx" ON "club_books"("is_deleted");
CREATE INDEX IF NOT EXISTS "book_collections_upload_context_id_idx" ON "book_collections"("upload_context_id");
CREATE INDEX IF NOT EXISTS "book_collection_items_collection_id_idx" ON "book_collection_items"("collection_id");
CREATE INDEX IF NOT EXISTS "book_collection_items_book_id_idx" ON "book_collection_items"("book_id");