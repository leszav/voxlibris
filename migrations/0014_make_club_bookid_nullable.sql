-- Изменение схемы клубов: bookId становится необязательным
-- Теперь клубы создаются без книги, а книги загружаются отдельно через upload_contexts

-- Удаляем существующий внешний ключ
ALTER TABLE "clubs" DROP CONSTRAINT IF EXISTS "clubs_book_id_books_id_fk";

-- Делаем bookId nullable
ALTER TABLE "clubs" ALTER COLUMN "book_id" DROP NOT NULL;

-- Добавляем внешний ключ заново с каскадным удалением
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_book_id_books_id_fk" 
  FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Создаем индекс для оптимизации запросов
CREATE INDEX IF NOT EXISTS "clubs_book_id_idx" ON "clubs"("book_id");

-- Изменяем каскадное удаление для книг при удалении upload_context
-- При удалении клуба -> удаляется upload_context -> удаляются все книги клуба
ALTER TABLE "books" DROP CONSTRAINT IF EXISTS "books_upload_context_id_upload_contexts_id_fk";
ALTER TABLE "books" ADD CONSTRAINT "books_upload_context_id_upload_contexts_id_fk" 
  FOREIGN KEY ("upload_context_id") REFERENCES "public"."upload_contexts"("id") ON DELETE CASCADE;

