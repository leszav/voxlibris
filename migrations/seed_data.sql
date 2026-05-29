-- Seed data script for VoxLibris
-- Run this after all migrations are applied

-- ⚠️ ВАЖНО: Создание администратора
-- 
-- Для создания первого администратора выполните следующие шаги:
--
-- 1. Сгенерируйте bcrypt-хеш вашего пароля (используйте онлайн-генератор или Node.js):
--    const bcrypt = require('bcrypt');
--    const hash = await bcrypt.hash('ваш_надёжный_пароль', 10);
--    console.log(hash);
--
-- 2. Замените YOUR_EMAIL и YOUR_BCRYPT_HASH ниже на ваши данные
--
-- 3. Раскомментируйте и выполните SQL-запросы:

/*
-- Insert admin user
INSERT INTO users (username, email, password, role, status, email_confirmed, created_at)
VALUES (
  'YOUR_EMAIL',
  'YOUR_EMAIL',
  'YOUR_BCRYPT_HASH',
  'admin',
  'active',
  true,
  NOW()
) ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  role = 'admin',
  status = 'active',
  email_confirmed = true;

-- Create user profile for admin
INSERT INTO user_profiles (user_id, display_name, is_reader, created_at)
SELECT
  u.id,
  'Administrator',
  false,
  NOW()
FROM users u
WHERE u.email = 'YOUR_EMAIL'
ON CONFLICT (user_id) DO NOTHING;

-- Verify creation
SELECT 'Admin user and profile created successfully!' as result;
*/

-- Альтернативный способ: используйте API регистрации и затем вручную обновите роль в БД:
-- UPDATE users SET role = 'admin', status = 'active', email_confirmed = true WHERE email = 'ваш_email';
