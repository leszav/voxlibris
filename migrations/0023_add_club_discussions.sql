-- 0023_add_club_discussions.sql
-- Добавление доски обсуждений для клубов

CREATE TABLE IF NOT EXISTS club_discussions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id VARCHAR NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_id VARCHAR REFERENCES club_discussions(id) ON DELETE CASCADE, -- для ответов (replies)
    quoted_content TEXT, -- цитируемый текст для ответов
    is_warning BOOLEAN NOT NULL DEFAULT false, -- предупреждение от владельца клуба
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_club_discussions_club_id ON club_discussions(club_id);
CREATE INDEX IF NOT EXISTS idx_club_discussions_user_id ON club_discussions(user_id);
CREATE INDEX IF NOT EXISTS idx_club_discussions_parent_id ON club_discussions(parent_id);
CREATE INDEX IF NOT EXISTS idx_club_discussions_created_at ON club_discussions(created_at DESC);

-- Комментарий к таблице
COMMENT ON TABLE club_discussions IS 'Доска обсуждений клуба с возможностью ответов и цитирования';
COMMENT ON COLUMN club_discussions.parent_id IS 'ID родительского сообщения для ответов (NULL для основных сообщений)';
COMMENT ON COLUMN club_discussions.quoted_content IS 'Цитируемый текст из сообщения, на которое отвечают';
COMMENT ON COLUMN club_discussions.is_warning IS 'Предупреждение от владельца клуба (отображается красным жирным шрифтом)';
