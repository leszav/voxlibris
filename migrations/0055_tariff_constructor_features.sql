CREATE TABLE IF NOT EXISTS commerce_feature_registry (
  key varchar(120) PRIMARY KEY,
  title varchar(180) NOT NULL,
  description text,
  category varchar(60) NOT NULL,
  scope_type varchar(30) NOT NULL,
  value_type varchar(20) NOT NULL DEFAULT 'boolean',
  default_bool boolean,
  default_int integer,
  default_text text,
  default_json jsonb,
  is_public boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE commerce_product_features ADD COLUMN IF NOT EXISTS value_type varchar(20) NOT NULL DEFAULT 'boolean';
ALTER TABLE commerce_product_features ADD COLUMN IF NOT EXISTS value_bool boolean;
ALTER TABLE commerce_product_features ADD COLUMN IF NOT EXISTS value_int integer;
ALTER TABLE commerce_product_features ADD COLUMN IF NOT EXISTS value_text text;
ALTER TABLE commerce_product_features ADD COLUMN IF NOT EXISTS value_json jsonb;
ALTER TABLE commerce_product_features ADD COLUMN IF NOT EXISTS reset_period varchar(20);

UPDATE commerce_product_features
SET value_bool = true
WHERE value_bool IS NULL AND feature_key = 'reader_club_access';

CREATE INDEX IF NOT EXISTS commerce_feature_registry_scope_idx ON commerce_feature_registry(scope_type, category, is_active);
CREATE INDEX IF NOT EXISTS commerce_product_features_feature_key_idx ON commerce_product_features(feature_key);

INSERT INTO commerce_feature_registry
  (key, title, category, scope_type, value_type, default_bool, default_int, default_text, is_public, is_active)
VALUES
  ('personal_library.max_books', 'Книги в личной библиотеке', 'platform', 'platform', 'integer', NULL, 100, NULL, true, true),
  ('personal_books.upload.enabled', 'Загрузка личных книг', 'platform', 'platform', 'boolean', true, NULL, NULL, true, true),
  ('personal_notes.max_count', 'Личные заметки', 'platform', 'platform', 'integer', NULL, 500, NULL, true, true),
  ('clubs.joined.max_count', 'Участие в клубах', 'platform', 'platform', 'integer', NULL, 10, NULL, true, true),
  ('recommendations.advanced.enabled', 'Расширенные рекомендации', 'platform', 'platform', 'boolean', false, NULL, NULL, true, true),
  ('calendar.advanced.enabled', 'Расширенный календарь', 'platform', 'platform', 'boolean', false, NULL, NULL, true, true),
  ('notifications.advanced.enabled', 'Расширенные уведомления', 'platform', 'platform', 'boolean', false, NULL, NULL, true, true),
  ('clubs.owned.max_count', 'Созданные клубы', 'clubs', 'club', 'integer', NULL, 1, NULL, true, true),
  ('club.members.max_count', 'Участники клуба', 'clubs', 'club', 'integer', NULL, 20, NULL, true, true),
  ('club.private.enabled', 'Приватный клуб', 'clubs', 'club', 'boolean', false, NULL, NULL, true, true),
  ('club.moderators.max_count', 'Модераторы клуба', 'clubs', 'club', 'integer', NULL, 1, NULL, true, true),
  ('club.books.max_count', 'Книги клуба', 'clubs', 'club', 'integer', NULL, 5, NULL, true, true),
  ('club.schedule.enabled', 'Расписание клуба', 'clubs', 'club', 'boolean', true, NULL, NULL, true, true),
  ('club.discussions.enabled', 'Обсуждения клуба', 'clubs', 'club', 'boolean', true, NULL, NULL, true, true),
  ('club.analytics.level', 'Аналитика клуба', 'clubs', 'club', 'string', NULL, NULL, 'basic', true, true),
  ('reader_club_access', 'Доступ к клубу чтеца', 'reader_clubs', 'reader_club', 'boolean', false, NULL, NULL, true, true),
  ('studio.live.enabled', 'Live-эфиры Studio', 'studio', 'reader_club', 'boolean', false, NULL, NULL, true, true),
  ('studio.live.max_listener_count', 'Слушатели live-эфира', 'studio', 'reader_club', 'integer', NULL, 0, NULL, true, true),
  ('studio.live.max_duration_minutes', 'Длительность live-эфира', 'studio', 'reader_club', 'integer', NULL, 0, NULL, true, true),
  ('studio.recordings.enabled', 'Записи Studio', 'studio', 'reader_club', 'boolean', false, NULL, NULL, true, true),
  ('studio.recordings.max_count', 'Количество записей Studio', 'studio', 'reader_club', 'integer', NULL, 0, NULL, true, true),
  ('studio.recordings.storage_mb', 'Хранилище записей Studio', 'studio', 'reader_club', 'integer', NULL, 0, NULL, true, true),
  ('studio.recordings.publication.enabled', 'Публикация записей Studio', 'studio', 'reader_club', 'boolean', false, NULL, NULL, true, true),
  ('studio.analytics.level', 'Аналитика Studio', 'studio', 'reader_club', 'string', NULL, NULL, 'none', true, true)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  scope_type = EXCLUDED.scope_type,
  value_type = EXCLUDED.value_type,
  default_bool = EXCLUDED.default_bool,
  default_int = EXCLUDED.default_int,
  default_text = EXCLUDED.default_text,
  is_public = EXCLUDED.is_public,
  is_active = EXCLUDED.is_active,
  updated_at = now();
