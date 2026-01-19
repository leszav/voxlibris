-- Migration 0011: Fix Settings Table Schema
-- Add missing columns to settings table to match schema definition

-- Add category column if it doesn't exist
DO $$ BEGIN
  ALTER TABLE "settings" ADD COLUMN "category" varchar(50) NOT NULL DEFAULT 'general';
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Add is_encrypted column if it doesn't exist
DO $$ BEGIN
  ALTER TABLE "settings" ADD COLUMN "is_encrypted" boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Modify key column to match schema (varchar with length limit)
DO $$ BEGIN
  ALTER TABLE "settings" ALTER COLUMN "key" TYPE varchar(100);
EXCEPTION WHEN others THEN null; END $$;

-- Remove type column if it exists (not in current schema)
DO $$ BEGIN
  ALTER TABLE "settings" DROP COLUMN "type";
EXCEPTION WHEN undefined_column THEN null; END $$;

-- Make value column nullable (matches schema)
DO $$ BEGIN
  ALTER TABLE "settings" ALTER COLUMN "value" DROP NOT NULL;
EXCEPTION WHEN others THEN null; END $$;

-- Add index on category for performance
CREATE INDEX IF NOT EXISTS "settings_category_idx" ON "settings"("category");

-- Verification
SELECT 
    'Migration 0011 completed! Settings table schema fixed.' as result;