-- Migration 0037: Normalized genres model for personal and club libraries
-- Safety + idempotency: all DDL guarded with IF NOT EXISTS / DO blocks.

-- 1) Canonical genres dictionary
CREATE TABLE IF NOT EXISTS "genres" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(120) NOT NULL UNIQUE,
  "label_ru" text NOT NULL,
  "label_en" text,
  "group_key" varchar(80),
  "description" text,
  "aliases_json" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- 2) Bridge table: books <-> genres (personal + club)
CREATE TABLE IF NOT EXISTS "book_genres" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "book_id" varchar NOT NULL,
  "book_type" text NOT NULL,
  "genre_id" varchar NOT NULL,
  "source" text NOT NULL DEFAULT 'metadata',
  "is_primary" boolean NOT NULL DEFAULT false,
  "confidence" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "book_genres_book_type_check" CHECK ("book_type" in ('personal', 'club')),
  CONSTRAINT "book_genres_source_check" CHECK ("source" in ('metadata', 'manual', 'migration', 'admin'))
);

-- 3) FK from bridge table to genres
DO $$ BEGIN
  ALTER TABLE "book_genres"
    ADD CONSTRAINT "book_genres_genre_id_genres_id_fk"
    FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4) Optional primary genre reference in book tables
DO $$ BEGIN
  ALTER TABLE "personal_books" ADD COLUMN IF NOT EXISTS "primary_genre_id" varchar;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "club_books" ADD COLUMN IF NOT EXISTS "primary_genre_id" varchar;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "personal_books"
    ADD CONSTRAINT "personal_books_primary_genre_id_genres_id_fk"
    FOREIGN KEY ("primary_genre_id") REFERENCES "public"."genres"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "club_books"
    ADD CONSTRAINT "club_books_primary_genre_id_genres_id_fk"
    FOREIGN KEY ("primary_genre_id") REFERENCES "public"."genres"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 5) Indexes for filters/sorting/grouping
CREATE INDEX IF NOT EXISTS "genres_code_idx" ON "genres" USING btree ("code");
CREATE INDEX IF NOT EXISTS "genres_group_key_idx" ON "genres" USING btree ("group_key");
CREATE INDEX IF NOT EXISTS "book_genres_book_type_book_id_idx" ON "book_genres" USING btree ("book_type", "book_id");
CREATE INDEX IF NOT EXISTS "book_genres_genre_id_idx" ON "book_genres" USING btree ("genre_id");
CREATE INDEX IF NOT EXISTS "book_genres_book_type_genre_id_idx" ON "book_genres" USING btree ("book_type", "genre_id");
CREATE INDEX IF NOT EXISTS "personal_books_primary_genre_id_idx" ON "personal_books" USING btree ("primary_genre_id");
CREATE INDEX IF NOT EXISTS "club_books_primary_genre_id_idx" ON "club_books" USING btree ("primary_genre_id");

SELECT 'Migration 0037 completed: normalized genres model created' AS result;

