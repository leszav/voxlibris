-- Консолидированная миграция гостевой системы (0033 + 0034)
-- Цель: безопасное применение на проде и поддержка повторного запуска

-- ================================
-- Таблица guest_accounts
-- ================================
CREATE TABLE IF NOT EXISTS guest_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    access_code varchar(8) NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    last_seen_at timestamp NOT NULL DEFAULT now(),
    expires_at timestamp NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'deleted')),
    created_from_ip inet,
    created_user_agent text,
    browser_fingerprint varchar(64),
    recovery_attempts integer DEFAULT 0,
    last_recovery_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_accounts_access_code_idx ON guest_accounts(access_code);
CREATE INDEX IF NOT EXISTS guest_accounts_expires_at_idx ON guest_accounts(expires_at);
CREATE INDEX IF NOT EXISTS guest_accounts_fingerprint_idx ON guest_accounts(browser_fingerprint);
CREATE INDEX IF NOT EXISTS guest_accounts_last_seen_idx ON guest_accounts(last_seen_at);

-- ================================
-- Таблица guest_books
-- ================================
CREATE TABLE IF NOT EXISTS guest_books (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_account_id uuid NOT NULL REFERENCES guest_accounts(id) ON DELETE CASCADE,
    title text NOT NULL,
    author text NOT NULL,
    description text,
    format varchar(10) NOT NULL CHECK (format IN ('epub', 'fb2')),
    file_size_bytes integer NOT NULL CHECK (file_size_bytes <= 1048576),
    original_filename text,
    flat_content text NOT NULL,
    content_hash varchar(64),
    word_count integer DEFAULT 0,
    uploaded_at timestamp NOT NULL DEFAULT now(),
    expires_at timestamp NOT NULL,
    is_deleted boolean NOT NULL DEFAULT false,
    deleted_at timestamp,
    moderation_status varchar(20) DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
    moderated_by varchar(255) REFERENCES users(id),
    moderated_at timestamp,
    moderation_notes text
);

ALTER TABLE guest_books
  ADD COLUMN IF NOT EXISTS original_file_storage_key text,
  ADD COLUMN IF NOT EXISTS original_file_content_type text;

CREATE UNIQUE INDEX IF NOT EXISTS guest_books_one_active_per_account
ON guest_books (guest_account_id)
WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS guest_books_expires_at_idx ON guest_books(expires_at);
CREATE INDEX IF NOT EXISTS guest_books_moderation_idx ON guest_books(moderation_status);
CREATE INDEX IF NOT EXISTS guest_books_guest_account_idx ON guest_books(guest_account_id);

-- ================================
-- Таблица guest_reading_positions
-- ================================
CREATE TABLE IF NOT EXISTS guest_reading_positions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_account_id uuid NOT NULL REFERENCES guest_accounts(id) ON DELETE CASCADE,
    guest_book_id uuid NOT NULL REFERENCES guest_books(id) ON DELETE CASCADE,
    progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    current_position jsonb DEFAULT '{}',
    reading_time_minutes integer DEFAULT 0,
    last_read_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_reading_positions_unique ON guest_reading_positions(guest_account_id, guest_book_id);
CREATE INDEX IF NOT EXISTS guest_reading_positions_last_read_idx ON guest_reading_positions(last_read_at);

-- ================================
-- Таблица guest_analytics
-- ================================
CREATE TABLE IF NOT EXISTS guest_analytics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_account_id uuid NOT NULL REFERENCES guest_accounts(id) ON DELETE CASCADE,
    guest_book_id uuid REFERENCES guest_books(id) ON DELETE SET NULL,
    event_type varchar(30) NOT NULL CHECK (event_type IN ('book_upload', 'session_start', 'session_end', 'book_open')),
    event_data jsonb DEFAULT '{}',
    session_id varchar(64),
    created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_analytics_account_idx ON guest_analytics(guest_account_id);
CREATE INDEX IF NOT EXISTS guest_analytics_created_at_idx ON guest_analytics(created_at);

-- ================================
-- Комментарии
-- ================================
COMMENT ON TABLE guest_accounts IS 'Гостевые аккаунты с кодом доступа';
COMMENT ON TABLE guest_books IS 'Книги гостей (1 книга на аккаунт, макс 1 MiB)';
COMMENT ON TABLE guest_reading_positions IS 'Позиции чтения гостей';
COMMENT ON TABLE guest_analytics IS 'Аналитика чтения гостей (batch)';

COMMENT ON COLUMN guest_accounts.access_code IS 'Код доступа (6 символов)';
COMMENT ON COLUMN guest_accounts.browser_fingerprint IS 'Хеш fingerprint браузера для recovery';
COMMENT ON COLUMN guest_books.flat_content IS 'Текстовое содержимое книги (flattened)';

-- ================================
-- Feature flag гостевого доступа
-- ================================
INSERT INTO settings (key, value, category, description, is_encrypted) VALUES
  ('guest.access.enabled', 'false', 'features', 'Enable/disable guest account functionality', false)
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS settings_category_feature_idx
ON settings(category)
WHERE category = 'features';
