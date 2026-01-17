-- VoxLibris Upload System Migration
-- Добавляет поддержку для персональной, клубной и reader загрузки книг

-- Добавляем новые поля в таблицу books для VoxLibris Upload
ALTER TABLE "books" ADD COLUMN "uploaded_by" varchar;
--> statement-breakpoint

ALTER TABLE "books" ADD COLUMN "uploaded_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "books" ADD COLUMN "content_hash" varchar(64);
--> statement-breakpoint

ALTER TABLE "books" ADD COLUMN "word_count" integer DEFAULT 0;
--> statement-breakpoint

ALTER TABLE "books" ADD COLUMN "processing_status" text DEFAULT 'pending';
--> statement-breakpoint

-- Создаем таблицу контекстов загрузки
CREATE TABLE IF NOT EXISTS "upload_contexts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL,
  "user_id" varchar NOT NULL,
  "club_id" varchar,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Создаем таблицу коллекций книг
CREATE TABLE IF NOT EXISTS "book_collections" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "upload_context_id" varchar NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Создаем таблицу элементов коллекций
CREATE TABLE IF NOT EXISTS "book_collection_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collection_id" varchar NOT NULL,
  "book_id" varchar NOT NULL,
  "position" integer DEFAULT 1 NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Создаем таблицу юридических подтверждений
CREATE TABLE IF NOT EXISTS "legal_acknowledgments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL,
  "upload_context_id" varchar NOT NULL,
  "ip_address" text NOT NULL,
  "user_agent" text,
  "acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Добавляем внешние ключи
DO $$ BEGIN
 ALTER TABLE "upload_contexts" ADD CONSTRAINT "upload_contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "upload_contexts" ADD CONSTRAINT "upload_contexts_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "book_collections" ADD CONSTRAINT "book_collections_upload_context_id_upload_contexts_id_fk" FOREIGN KEY ("upload_context_id") REFERENCES "upload_contexts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "book_collection_items" ADD CONSTRAINT "book_collection_items_collection_id_book_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "book_collections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "book_collection_items" ADD CONSTRAINT "book_collection_items_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "legal_acknowledgments" ADD CONSTRAINT "legal_acknowledgments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "legal_acknowledgments" ADD CONSTRAINT "legal_acknowledgments_upload_context_id_upload_contexts_id_fk" FOREIGN KEY ("upload_context_id") REFERENCES "upload_contexts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Добавляем ограничения проверки
ALTER TABLE "upload_contexts" ADD CONSTRAINT "upload_contexts_type_check" CHECK ("type" IN ('personal', 'club', 'reader'));
--> statement-breakpoint

ALTER TABLE "book_collection_items" ADD CONSTRAINT "book_collection_items_unique" UNIQUE("collection_id", "book_id");
--> statement-breakpoint

ALTER TABLE "books" ADD CONSTRAINT "books_processing_status_check" CHECK ("processing_status" IN ('pending', 'processing', 'completed', 'failed'));
--> statement-breakpoint

-- Создаем индексы для производительности
CREATE INDEX IF NOT EXISTS "idx_upload_contexts_user" ON "upload_contexts" ("user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_upload_contexts_club" ON "upload_contexts" ("club_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_upload_contexts_type" ON "upload_contexts" ("type");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_book_collections_upload_context" ON "book_collections" ("upload_context_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_collection_items_collection" ON "book_collection_items" ("collection_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_collection_items_book" ON "book_collection_items" ("book_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_collection_items_collection_order" ON "book_collection_items" ("collection_id", "position");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_legal_acknowledgments_user" ON "legal_acknowledgments" ("user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_legal_acknowledgments_upload_context" ON "legal_acknowledgments" ("upload_context_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_books_processing_status" ON "books" ("processing_status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_books_uploaded_by_at" ON "books" ("uploaded_by", "uploaded_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_books_content_hash" ON "books" ("content_hash") WHERE "content_hash" IS NOT NULL;
--> statement-breakpoint

-- Создаем триггер для обновления updated_at в коллекциях
CREATE OR REPLACE FUNCTION update_collection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trigger_update_collection_timestamp ON "book_collections";
--> statement-breakpoint

CREATE TRIGGER trigger_update_collection_timestamp
  BEFORE UPDATE ON "book_collections"
  FOR EACH ROW EXECUTE FUNCTION update_collection_timestamp();
--> statement-breakpoint

-- Создаем функцию для автоматической сортировки коллекций
CREATE OR REPLACE FUNCTION auto_sort_collection(collection_uuid varchar)
RETURNS VOID AS $$
DECLARE
  sort_type TEXT;
BEGIN
  -- Получаем настройки сортировки коллекции
  SELECT metadata::jsonb->>'auto_sort_by' INTO sort_type
  FROM book_collections 
  WHERE id = collection_uuid;
  
  -- Применяем сортировку в зависимости от типа
  IF sort_type = 'title' THEN
    UPDATE book_collection_items 
    SET order_in_collection = row_number() OVER (ORDER BY books.title)
    FROM books
    WHERE book_collection_items.collection_id = collection_uuid
      AND books.id = book_collection_items.book_id;
  ELSIF sort_type = 'author' THEN
    UPDATE book_collection_items 
    SET order_in_collection = row_number() OVER (ORDER BY books.author, books.title)
    FROM books
    WHERE book_collection_items.collection_id = collection_uuid
      AND books.id = book_collection_items.book_id;
  ELSIF sort_type = 'upload_date' THEN
    UPDATE book_collection_items 
    SET order_in_collection = row_number() OVER (ORDER BY books.uploaded_at DESC, books.created_at DESC)
    FROM books
    WHERE book_collection_items.collection_id = collection_uuid
      AND books.id = book_collection_items.book_id;
  END IF;
END;
$$ LANGUAGE plpgsql;