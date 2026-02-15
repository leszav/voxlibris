# Административное руководство

## Введение

Это руководство предназначено для администраторов платформы VoxLibris. Оно охватывает все аспекты управления системой, включая управление пользователями, модерацию контента, мониторинг производительности и решение технических проблем.

## Архитектура системы

### Обзор компонентов

VoxLibris состоит из следующих основных компонентов:

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js + TypeScript + Node.js 20+
- **Database**: PostgreSQL 14+ + Drizzle ORM
- **File Storage**: AWS S3-совместимое хранилище (MinIO)
- **Real-time communication**: WebSocket (Socket.IO)
- **Authentication**: JWT токены + система refresh токенов
- **Cache**: Redis для хранения сессий и ограничений по частоте

### Структура данных

Важные таблицы в базе данных:

- `users`: информация о пользователях
- `clubs`: информация о клубах
- `books`: каталог книг
- `reading_sessions`: сессии чтения
- `session_listeners`: участники сессий
- `club_invitations`: приглашения в клубы
- `refresh_tokens`: токены обновления
- `moderation_logs`: журнал модерации

## Управление пользователями

### Просмотр пользователей

Для просмотра списка пользователей:

```sql
SELECT id, username, email, role, created_at, last_login FROM users ORDER BY created_at DESC;
```

### Управление ролями

Для изменения роли пользователя:

```sql
UPDATE users SET role = 'admin' WHERE id = 'user-id';
-- Возможные роли: 'user', 'moderator', 'admin'
```

### Блокировка пользователей

Для блокировки пользователя:

```sql
UPDATE users SET is_active = false WHERE id = 'user-id';
```

### Управление сессиями

Для удаления всех refresh-токенов пользователя (принудительный logout):

```sql
DELETE FROM refresh_tokens WHERE user_id = 'user-id';
```

## Модерация контента

### Модерация клубов

Для просмотра всех клубов:

```sql
SELECT c.*, u.username as owner_name 
FROM clubs c 
JOIN users u ON c.owner_id = u.id 
ORDER BY c.created_at DESC;
```

Для модерации клуба (например, скрытие):

```sql
UPDATE clubs SET is_hidden = true WHERE id = 'club-id';
```

### Модерация книг

Для просмотра книг пользователя:

```sql
SELECT b.*, u.username as uploaded_by_name 
FROM books b 
JOIN users u ON b.uploaded_by = u.id 
WHERE b.uploaded_by = 'user-id';
```

Для удаления книги (с автоматическим удалением связанного контента):

```sql
DELETE FROM books WHERE id = 'book-id';
```

### Журнал модерации

Для ведения журнала модерационных действий:

```sql
INSERT INTO moderation_logs (moderator_id, target_type, target_id, action, reason, created_at) 
VALUES ('moderator-id', 'club', 'target-id', 'hide', 'нарушение правил', NOW());
```

## Мониторинг и аналитика

### Мониторинг активности

Для получения статистики по активности:

```sql
-- Количество новых пользователей за последние 7 дней
SELECT DATE(created_at) as date, COUNT(*) as count 
FROM users 
WHERE created_at >= NOW() - INTERVAL '7 days' 
GROUP BY DATE(created_at) 
ORDER BY date;

-- Количество сессий чтения за последние 7 дней
SELECT DATE(start_time) as date, COUNT(*) as count 
FROM reading_sessions 
WHERE start_time >= NOW() - INTERVAL '7 days' 
GROUP BY DATE(start_time) 
ORDER BY date;
```

### Аналитика производительности

Для мониторинга производительности системы:

- Проверяйте логи сервера в `/var/log/voxlibris/` или в системе логирования
- Мониторьте использование CPU и памяти
- Проверяйте время отклика API
- Следите за количеством активных WebSocket-соединений

## Управление системой

### Запуск и остановка службы

Для запуска приложения в режиме production:

```bash
# Установка переменных окружения
export NODE_ENV=production
export PORT=5000

# Запуск сервера
pnpm run build
pnpm run start
```

Для запуска в режиме разработки:

```bash
pnpm run dev
```

### Обновление системы

1. Создайте резервную копию базы данных:

```bash
pg_dump -h hostname -U username database_name > backup.sql
```

2. Сделайте резервную копию файлов:

```bash
tar -czf uploads_backup.tar.gz /path/to/uploads/
```

3. Обновите код:

```bash
git pull origin main
pnpm install
pnpm run build
```

4. Примените миграции базы данных:

```bash
pnpm run db:migrate
```

5. Перезапустите приложение.

### Резервное копирование

Регулярно создавайте резервные копии:

- Базы данных (используя pg_dump)
- Загруженных файлов (обложки, книги, записи)
- Конфигурационных файлов

### Управление логами

Логи находятся в следующих местах:

- Приложение: использует pino для логирования
- Веб-сервер: зависит от настройки reverse proxy
- База данных: логи PostgreSQL
- Файловое хранилище: логи MinIO (если используется)

## Безопасность

### Проверка безопасности

Регулярно проверяйте:

- Обновления зависимостей: `pnpm audit`
- Настройки SSL-сертификатов
- Права доступа к файлам
- Конфигурацию firewall

### Управление токенами

Для очистки просроченных refresh-токенов:

```sql
DELETE FROM refresh_tokens WHERE expires_at < NOW();
```

Система автоматически очищает просроченные токены, но при необходимости можно запустить процесс вручную:

```bash
pnpm run tsx script/auth-cleanup.ts
```

### Защита от атак

Система включает следующие меры защиты:

- Rate limiting через express-rate-limit
- Helmet для безопасных заголовков
- Проверка MIME-типов файлов
- Санитизация пользовательского контента
- Проверка расширений файлов

## Устранение неполадок

### Частые проблемы

#### Проблемы с производительностью

Если система работает медленно:

1. Проверьте использование CPU и памяти
2. Проверьте количество активных соединений к базе данных
3. Проверьте размер таблиц в базе данных
4. Проверьте логи на наличие ошибок

#### Проблемы с аутентификацией

Если пользователи не могут войти:

1. Проверьте, правильно ли настроены JWT-ключи
2. Проверьте работу Redis (если используется для rate limiting)
3. Проверьте, работают ли cookies
4. Проверьте логи аутентификации

#### Проблемы с файловым хранилищем

Если не загружаются или не открываются файлы:

1. Проверьте права доступа к файловому хранилищу
2. Проверьте настройки S3/MinIO
3. Проверьте размер файлов (ограничение 50MB)
4. Проверьте форматы файлов (только .epub, .fb2)

#### Проблемы с WebSocket

Если не работает чат или синхронизация:

1. Проверьте настройки CORS
2. Проверьте настройки reverse proxy (если используется)
3. Проверьте количество активных соединений
4. Проверьте логи WebSocket

### Диагностические команды

Для диагностики состояния системы:

```bash
# Проверка состояния базы данных
pnpm run tsx script/verify-schema.ts

# Проверка подключения к хранилищу
pnpm run tsx script/check-connections.ts

# Проверка целостности миграций
npx drizzle-kit introspect
```

## Настройка уведомлений

### Настройка SMTP

Для настройки отправки email-уведомлений:

1. Установите SMTP-параметры в `.env`:

```
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASS=your-password
SMTP_FROM=noreply@yourdomain.com
```

2. Проверьте настройки:

```bash
pnpm run tsx script/test-email.ts
```

### Управление уведомлениями

Для массовой рассылки уведомлений:

```sql
-- Отправка уведомления всем активным пользователям
INSERT INTO notifications (user_id, type, title, message, created_at)
SELECT id, 'system', 'Важное объявление', 'Текст объявления', NOW()
FROM users 
WHERE is_active = true AND email_notifications = true;
```

## Заключение

Это руководство охватывает основные аспекты администрирования платформы VoxLibris. Для дополнительной информации обращайтесь к технической документации или в службу поддержки разработчиков.