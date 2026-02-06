-- Seed data script for VoxLibris
-- Run this after all migrations are applied
-- Creates only the essential admin user with confirmed email

-- Insert admin user (uses gen_random_uuid() for proper UUID format)
INSERT INTO users (username, email, password, role, status, email_confirmed, created_at)
VALUES (
  'svv@8ls.ru',
  'svv@8ls.ru',
  -- Password: (Hashed with bcrypt)
  '$2b$10$ep9Jq/S3bHdPUQ3zT0CUI.s.0chRnTAEa8r4bTcUSgDW3Z.c6j5oO',
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
WHERE u.email = 'svv@8ls.ru'
ON CONFLICT (user_id) DO NOTHING;

-- Final message
SELECT 'Admin user and profile created successfully with confirmed email!' as result;