-- Исправление внешнего ключа clubs.book_id для ссылки на club_books вместо books
-- Удаляем старый внешний ключ
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_book_id_books_id_fk;

-- Добавляем новый внешний ключ на club_books
ALTER TABLE clubs ADD CONSTRAINT clubs_book_id_club_books_id_fk 
    FOREIGN KEY (book_id) REFERENCES club_books(id) ON DELETE SET NULL;
