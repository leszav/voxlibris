-- Drop existing foreign key constraints that reference books.id
ALTER TABLE "clubs" DROP CONSTRAINT IF EXISTS "clubs_book_id_books_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_progress" DROP CONSTRAINT IF EXISTS "reading_progress_book_id_books_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_progress" DROP CONSTRAINT IF EXISTS "reading_progress_club_id_clubs_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_sessions" DROP CONSTRAINT IF EXISTS "reading_sessions_club_id_clubs_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_sessions" DROP CONSTRAINT IF EXISTS "reading_sessions_book_id_books_id_fk";
--> statement-breakpoint

-- Add new foreign key constraints with CASCADE DELETE
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;