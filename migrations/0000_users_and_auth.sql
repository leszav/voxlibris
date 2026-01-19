-- Migration 0000: Users and Authentication System
-- Base tables for user management and authentication

-- Users table - core user management
CREATE TABLE IF NOT EXISTS "users" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" text NOT NULL,
  "email" text NOT NULL,
  "password" text NOT NULL,
  "role" text DEFAULT 'user' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "email_confirmed" boolean DEFAULT false NOT NULL,
  "confirmation_token" varchar(64),
  "invited_by" varchar,
  "invited_to_club" varchar,
  "last_activity_at" timestamp,
  "suspension_reason" text,
  "suspended_until" timestamp,
  "failed_login_attempts" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Refresh tokens for JWT authentication
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" text NOT NULL,
  "user_id" varchar NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "is_revoked" boolean DEFAULT false NOT NULL
);

-- Unique constraints
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token");
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_fk" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users"("role");
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users"("status");
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");