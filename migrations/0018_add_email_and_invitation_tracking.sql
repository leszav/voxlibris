-- Добавляем поле email в таблицу users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Копируем username в email для существующих пользователей (временно)
UPDATE users SET email = username WHERE email IS NULL;

-- Делаем email обязательным и уникальным
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);

-- Добавляем поля для отслеживания приглашений
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_to_club VARCHAR;

-- Создаем внешние ключи
ALTER TABLE users ADD CONSTRAINT users_invited_by_fkey 
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users ADD CONSTRAINT users_invited_to_club_fkey 
  FOREIGN KEY (invited_to_club) REFERENCES clubs(id) ON DELETE SET NULL;
