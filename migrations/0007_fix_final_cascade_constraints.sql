-- Окончательно исправляем все Foreign Key constraints для корректного CASCADE DELETE
-- Проблема: club_tags FK constraint блокирует каскадное удаление клубов

-- 1. Удаляем проблематичные constraints
ALTER TABLE "club_tags" DROP CONSTRAINT IF EXISTS "club_tags_club_id_clubs_id_fk";
--> statement-breakpoint
ALTER TABLE "club_members" DROP CONSTRAINT IF EXISTS "club_members_club_id_clubs_id_fk";
--> statement-breakpoint

-- 2. Создаём constraints с правильным CASCADE DELETE
ALTER TABLE "club_tags" ADD CONSTRAINT "club_tags_club_id_clubs_id_fk" 
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_clubs_id_fk" 
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint

-- 3. Проверяем и исправляем остальные constraints связанные с книгами
-- Убеждаемся что reading_progress и reading_sessions корректно ссылаются на books и clubs

-- Удаляем старые constraints если есть
ALTER TABLE "reading_progress" DROP CONSTRAINT IF EXISTS "reading_progress_book_id_books_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_progress" DROP CONSTRAINT IF EXISTS "reading_progress_club_id_clubs_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_sessions" DROP CONSTRAINT IF EXISTS "reading_sessions_book_id_books_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_sessions" DROP CONSTRAINT IF EXISTS "reading_sessions_club_id_clubs_id_fk";
--> statement-breakpoint

-- Создаём правильные constraints с CASCADE
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_id_books_id_fk" 
  FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_club_id_clubs_id_fk" 
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_book_id_books_id_fk" 
  FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_club_id_clubs_id_fk" 
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;