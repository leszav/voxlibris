-- Migration 0051: Feature flags for optional landing sections
-- Enables admins to explicitly publish reader-led clubs and top readers sections on the public landing page.

INSERT INTO settings (key, value, category, description, is_encrypted) VALUES
  ('landing.readerClubs.enabled', 'false', 'features', 'Enable/disable reader-led clubs section on the public landing page', false),
  ('landing.topReaders.enabled', 'false', 'features', 'Enable/disable top readers section on the public landing page', false)
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS settings_category_feature_idx
ON settings(category)
WHERE category = 'features';
