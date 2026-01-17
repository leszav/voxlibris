CREATE TABLE "admin_actions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"action_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar NOT NULL,
	"reason" text,
	"previous_value" text,
	"new_value" text,
	"metadata" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"target_id" varchar NOT NULL,
	"reporter_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"assigned_to" varchar,
	"resolution" text,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"type" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "blocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "block_reason" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "download_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "status" text DEFAULT 'recruiting' NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "archive_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_activity_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;