-- Migration: 0045_add_extended_profiles
-- Sprint 2.5: Расширенные профили
-- Идемпотентна: можно запускать повторно

-- Расширение user_profiles для читательской идентичности
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "profile_quote" text,
  ADD COLUMN IF NOT EXISTS "profile_quote_author" text;

-- Кураторская полка профиля (избранные книги + краткая рецензия)
CREATE TABLE IF NOT EXISTS "profile_bookshelf" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "book_id" varchar NOT NULL,
  "book_type" text NOT NULL,
  "review_text" text,
  "rating" integer,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "profile_bookshelf_book_type_check" CHECK ("book_type" IN ('personal', 'club')),
  CONSTRAINT "profile_bookshelf_rating_check" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5)),
  CONSTRAINT "profile_bookshelf_unique_book" UNIQUE ("user_id", "book_id", "book_type")
);

CREATE INDEX IF NOT EXISTS "idx_profile_bookshelf_user_order"
  ON "profile_bookshelf"("user_id", "display_order", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_profile_bookshelf_book"
  ON "profile_bookshelf"("book_id", "book_type");
