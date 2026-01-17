-- Обновление существующих пользователей с новыми полями
-- Добавляем значения по умолчанию для emailConfirmed и confirmationToken

-- Для всех существующих активных пользователей устанавливаем emailConfirmed = true
UPDATE users 
SET 
  email_confirmed = COALESCE(email_confirmed, true),
  confirmation_token = NULL
WHERE email_confirmed IS NULL OR confirmation_token IS NULL;

-- Для pending пользователей устанавливаем emailConfirmed = false
UPDATE users 
SET email_confirmed = false
WHERE status = 'pending' AND email_confirmed IS NULL;
