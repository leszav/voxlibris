-- Индексы для оптимизации производительности базы данных
-- Фаза 2: Добавление индексов согласно плану безопасности

-- Индексы для книг
CREATE INDEX CONCURRENTLY idx_books_uploaded_by_created ON books(uploaded_by, created_at DESC);
CREATE INDEX CONCURRENTLY idx_books_status ON books(status) WHERE status IN ('active', 'processing');
CREATE INDEX CONCURRENTLY idx_books_title_gin ON books USING gin(to_tsvector('english', title));

-- Индексы для пользователей
CREATE INDEX CONCURRENTLY idx_users_status ON users(status) WHERE status = 'active';
CREATE INDEX CONCURRENTLY idx_users_email ON users(email) WHERE status = 'active';

-- Индексы для клубов
CREATE INDEX CONCURRENTLY idx_clubs_owner_is_active ON clubs(owner_id, is_active) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_clubs_status ON clubs(status) WHERE status IN ('recruiting', 'active');

-- Индексы для членства в клубах
CREATE INDEX CONCURRENTLY idx_club_members_user_active ON club_members(user_id, is_active) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_club_members_club_active ON club_members(club_id, is_active) WHERE is_active = true;

-- Индексы для прогресса чтения
CREATE INDEX CONCURRENTLY idx_reading_progress_user_book ON reading_progress(user_id, book_id);
CREATE INDEX CONCURRENTLY idx_reading_progress_updated ON reading_progress(updated_at DESC);

-- Индексы для сессий чтения
CREATE INDEX CONCURRENTLY idx_reading_sessions_book_active ON reading_sessions(book_id, is_active) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_reading_sessions_created ON reading_sessions(created_at DESC);

-- Индексы для аналитики
CREATE INDEX CONCURRENTLY idx_analytics_events_user_date ON analytics_events(user_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_analytics_events_type_date ON analytics_events(event_type, created_at DESC);

-- Индексы для refresh токенов
CREATE INDEX CONCURRENTLY idx_refresh_tokens_user_active ON refresh_tokens(user_id) WHERE is_revoked = false;
CREATE INDEX CONCURRENTLY idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE expires_at > NOW();

-- Индексы для административных действий
CREATE INDEX CONCURRENTLY idx_admin_actions_user_date ON admin_actions(user_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_moderation_reports_status_date ON moderation_reports(status, created_at DESC);