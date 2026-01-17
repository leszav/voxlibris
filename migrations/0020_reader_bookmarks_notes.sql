-- Reader: bookmarks и notes миграция

-- Таблица закладок
CREATE TABLE IF NOT EXISTS "bookmarks" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR NOT NULL,
  "book_id" VARCHAR NOT NULL,
  "chapter_number" INTEGER,
  "position" TEXT NOT NULL, -- JSON: {scrollTop, paragraph, offset}
  "title" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "bookmarks_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "bookmarks_user_book_idx" ON "bookmarks"("user_id", "book_id");
CREATE INDEX IF NOT EXISTS "bookmarks_book_idx" ON "bookmarks"("book_id");

-- Таблица заметок
CREATE TABLE IF NOT EXISTS "notes" (
  "id" VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" VARCHAR NOT NULL,
  "book_id" VARCHAR NOT NULL,
  "chapter_number" INTEGER,
  "position" TEXT NOT NULL, -- JSON: {scrollTop, paragraph, offset}
  "highlighted_text" TEXT,
  "note_text" TEXT NOT NULL,
  "color" VARCHAR(20) DEFAULT 'yellow', -- yellow, blue, green, pink
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "notes_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "notes_user_book_idx" ON "notes"("user_id", "book_id");
CREATE INDEX IF NOT EXISTS "notes_book_idx" ON "notes"("book_id");
CREATE INDEX IF NOT EXISTS "notes_updated_idx" ON "notes"("updated_at");
