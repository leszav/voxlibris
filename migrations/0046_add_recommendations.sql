-- Migration: 0046_add_recommendations
-- Sprint 2.6: Dismiss и персональные фильтры рекомендаций
-- Идемпотентна: можно запускать повторно

CREATE TABLE IF NOT EXISTS "recommendation_dismissals" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entity_type" varchar(20) NOT NULL,
  "entity_id" varchar NOT NULL,
  "source" varchar(20),
  "reason" varchar(120),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "recommendation_dismissals_entity_type_check"
    CHECK ("entity_type" IN ('book', 'club', 'reader', 'live')),
  CONSTRAINT "recommendation_dismissals_source_check"
    CHECK ("source" IS NULL OR "source" IN ('activity', 'community', 'mixed')),
  CONSTRAINT "recommendation_dismissals_user_entity_unique"
    UNIQUE ("user_id", "entity_type", "entity_id")
);

CREATE INDEX IF NOT EXISTS "idx_recommendation_dismissals_user_created"
  ON "recommendation_dismissals"("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_recommendation_dismissals_user_type"
  ON "recommendation_dismissals"("user_id", "entity_type");

CREATE TABLE IF NOT EXISTS "recommendation_preferences" (
  "user_id" varchar PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "excluded_types_json" text NOT NULL DEFAULT '[]',
  "books_source_preference" varchar(20) NOT NULL DEFAULT 'all',
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "recommendation_preferences_source_check"
    CHECK ("books_source_preference" IN ('all', 'activity', 'community'))
);

CREATE INDEX IF NOT EXISTS "idx_recommendation_preferences_source"
  ON "recommendation_preferences"("books_source_preference");
