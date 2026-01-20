-- Migration 0014: Add Club Reading Plans Tables
-- Добавляет таблицы для планов чтения клубов

-- План чтения для клубной книги
CREATE TABLE IF NOT EXISTS "club_reading_plans" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_book_id" varchar NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "order_index" integer NOT NULL,
  "start_chapter" integer,
  "end_chapter" integer,
  "target_date" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Прогресс участников по плану чтения
CREATE TABLE IF NOT EXISTS "club_reading_plan_progress" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "status" varchar(20) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "club_reading_plans" ADD CONSTRAINT "club_reading_plans_club_book_id_fk" 
    FOREIGN KEY ("club_book_id") REFERENCES "club_books"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_reading_plan_progress" ADD CONSTRAINT "club_reading_plan_progress_plan_id_fk" 
    FOREIGN KEY ("plan_id") REFERENCES "club_reading_plans"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "club_reading_plan_progress" ADD CONSTRAINT "club_reading_plan_progress_user_id_fk" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "club_reading_plans_club_book_id_idx" ON "club_reading_plans"("club_book_id");
CREATE INDEX IF NOT EXISTS "club_reading_plans_order_index_idx" ON "club_reading_plans"("order_index");
CREATE INDEX IF NOT EXISTS "club_reading_plan_progress_plan_id_idx" ON "club_reading_plan_progress"("plan_id");
CREATE INDEX IF NOT EXISTS "club_reading_plan_progress_user_id_idx" ON "club_reading_plan_progress"("user_id");
