-- Исправление constraint reading_progress для поддержки personal_books
-- Проблема: reading_progress.book_id ссылается только на books.id,
-- но книги VoxLibris хранятся в personal_books

-- Удаляем существующий foreign key constraint
ALTER TABLE "reading_progress" 
DROP CONSTRAINT IF EXISTS "reading_progress_book_id_books_id_fk";

-- Теперь book_id может ссылаться как на books.id, так и на personal_books.id
-- Приложение будет само определять, в какой таблице искать книгу
