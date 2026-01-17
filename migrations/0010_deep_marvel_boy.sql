CREATE TABLE "analytics_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"user_id" varchar,
	"book_id" varchar,
	"club_id" varchar,
	"chapter_number" integer,
	"duration" integer,
	"progress" integer,
	"metadata" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_access_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" varchar NOT NULL,
	"book_type" text NOT NULL,
	"user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"device_type" text,
	"session_duration_minutes" integer,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "club_books" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" varchar NOT NULL,
	"uploaded_by_user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"description" text,
	"publication_year" integer,
	"genre" text,
	"language" text,
	"format" text NOT NULL,
	"file_hash" varchar(64),
	"file_size_bytes" integer,
	"storage_path" text NOT NULL,
	"encrypted_content_key" text,
	"cover_url" text,
	"recommended_reading_order" integer,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"soft_deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_books_library" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"added_by" varchar NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_books" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"description" text,
	"publication_year" integer,
	"genre" text,
	"language" text,
	"format" text NOT NULL,
	"file_hash" varchar(64),
	"file_size_bytes" integer,
	"storage_path" text NOT NULL,
	"encrypted_content_key" text,
	"cover_url" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"soft_deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_books_library" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"book_id" varchar NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"last_read_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "book_access_logs" ADD CONSTRAINT "book_access_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "club_books" ADD CONSTRAINT "club_books_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "club_books" ADD CONSTRAINT "club_books_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "club_books_library" ADD CONSTRAINT "club_books_library_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "club_books_library" ADD CONSTRAINT "club_books_library_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "club_books_library" ADD CONSTRAINT "club_books_library_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "personal_books" ADD CONSTRAINT "personal_books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_books_library" ADD CONSTRAINT "user_books_library_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_books_library" ADD CONSTRAINT "user_books_library_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_confirmed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "confirmation_token" varchar(64);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_activity_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspension_reason" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;
