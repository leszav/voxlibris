# Руководство администратора

Этот раздел содержит информацию для администраторов системы VoxLibris по управлению платформой, мониторингу и решению проблем.

## Обзор

Администратор VoxLibris отвечает за:
- Управление пользователями и ролями
- Модерацию контента и клубов
- Мониторинг системы
- Резервное копирование
- Обновление системы

## Доступ к административной панели

### URL доступа
- **Development**: http://localhost:5173/admin
- **Production**: https://voxlibris.ru/admin

### Уровни доступа

1. **Super Admin** - полный доступ ко всем функциям
2. **Admin** - управление пользователями и контентом
3. **Moderator** - модерация контента и клубов
4. **Club Admin** - управление конкретным клубом

## Управление пользователями

### Просмотр пользователей

```bash
# Через API
curl -H "Authorization: Bearer <token>" \
  https://voxlibris.ru/api/admin/users

# Через базу данных
SELECT id, username, email, role, created_at, last_active 
FROM users 
ORDER BY created_at DESC;
```

### Управление ролями

```sql
-- Назначение роли администратора
UPDATE users 
SET role = 'admin' 
WHERE email = 'admin@example.com';

-- Просмотр пользователей с ролями
SELECT role, COUNT(*) as count 
FROM users 
GROUP BY role;
```

### Блокировка пользователей

```sql
-- Блокировка пользователя
UPDATE users 
SET status = 'banned', blocked_at = NOW() 
WHERE id = 123;

-- Разблокировка
UPDATE users 
SET status = 'active', blocked_at = NULL 
WHERE id = 123;

-- Просмотр заблокированных
SELECT * FROM users WHERE status = 'banned';
```

## Управление клубами

### Модерация клубов

```bash
# Получение списка клубов на модерации
curl -H "Authorization: Bearer <token>" \
  https://voxlibris.ru/api/admin/clubs/pending

# Одобрение клуба
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}' \
  https://voxlibris.ru/api/admin/clubs/123/moderate
```

### Управление участниками клубов

```sql
-- Просмотр участников клуба
SELECT u.username, u.email, cm.role, cm.joined_at
FROM users u
JOIN club_members cm ON u.id = cm.user_id
WHERE cm.club_id = 123
ORDER BY cm.joined_at;

-- Удаление участника
DELETE FROM club_members 
WHERE club_id = 123 AND user_id = 456;
```

## Управление контентом

### Модерация книг

```bash
# Получение книг на модерации
curl -H "Authorization: Bearer <token>" \
  https://voxlibris.ru/api/admin/books/pending

# Одобрение книги
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -d '{"status": "approved"}' \
  https://voxlibris.ru/api/admin/books/789/moderate
```

### Управление комментариями

```sql
-- Просмотр жалоб на комментарии
SELECT * FROM moderation_reports 
WHERE status = 'pending' AND target_type = 'comment';

-- Удаление комментария
DELETE FROM book_comments WHERE id = 456;

-- Блокировка автора комментария
UPDATE users 
SET status = 'banned' 
WHERE id = (SELECT user_id FROM book_comments WHERE id = 456);
```

## Мониторинг системы

### Основные метрики

```sql
-- Активные пользователи за последние 24 часа
SELECT COUNT(DISTINCT user_id) as active_users
FROM analytics_events 
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Количество сессий чтения
SELECT COUNT(*) as total_sessions,
       COUNT(CASE WHEN scheduled_at > NOW() THEN 1 END) as upcoming_sessions
FROM reading_sessions;

-- Размер базы данных
SELECT pg_size_pretty(pg_database_size('voxlibris')) as db_size;
```

### Мониторинг производительности

```bash
# Проверка нагрузки на CPU
docker stats --no-stream

# Проверка использования памяти
docker exec voxlibris_postgres \
  psql -U postgres -c "SELECT * FROM pg_stat_activity;"

# Проверка дискового пространства
df -h
```

### Логи системы

```bash
# Логи приложения
docker-compose logs -f app

# Логи Nginx
docker-compose logs -f nginx

# Логи базы данных
docker-compose logs -f postgres

# Поиск ошибок в логах
docker-compose logs app | grep ERROR
```

## Резервное копирование

### Автоматический backup

```bash
# Запуск backup
./scripts/backup.sh

# Проверка наличия backup
ls -la /opt/backups/voxlibris/

# Восстановление из backup
./scripts/restore.sh /opt/backups/voxlibris/20240524_120000
```

### Backup важных таблиц

```bash
# Backup пользователей
docker exec voxlibris_postgres \
  pg_dump -U postgres -t users voxlibris > users_backup.sql

# Backup клубов
docker exec voxlibris_postgres \
  pg_dump -U postgres -t clubs -t club_members voxlibris > clubs_backup.sql
```

## Обновление системы

### Процесс обновления

```bash
# 1. Создание backup
./scripts/backup.sh

# 2. Остановка сервисов
docker-compose -f docker-compose.prod.yml down

# 3. Обновление кода
git pull origin main

# 4. Обновление зависимостей
docker-compose -f docker-compose.prod.yml build

# 5. Применение миграций
docker-compose -f docker-compose.prod.yml run --rm app pnpm run db:migrate

# 6. Запуск сервисов
docker-compose -f docker-compose.prod.yml up -d

# 7. Проверка статуса
docker-compose -f docker-compose.prod.yml ps
```

### Откат обновления

```bash
# 1. Остановка сервисов
docker-compose -f docker-compose.prod.yml down

# 2. Откат кода
git checkout <previous-commit-hash>

# 3. Восстановление из backup
./scripts/restore.sh /opt/backups/voxlibris/<backup-date>

# 4. Запуск сервисов
docker-compose -f docker-compose.prod.yml up -d
```

## Безопасность

### Мониторинг безопасности

```sql
-- Подозрительные действия
SELECT user_id, COUNT(*) as failed_attempts
FROM audit_logs 
WHERE action = 'login_failed' 
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id 
HAVING COUNT(*) > 5;

-- Новые пользователи за последние 24 часа
SELECT username, email, created_at
FROM users 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Управление доступом

```bash
# Просмотр активных сессий
curl -H "Authorization: Bearer <token>" \
  https://voxlibris.ru/api/admin/sessions

# Завершение сессии пользователя
curl -X DELETE \
  -H "Authorization: Bearer <token>" \
  https://voxlibris.ru/api/admin/sessions/<session-id>
```

## Решение проблем

### Частые проблемы

#### 1. Пользователи не могут войти

```bash
# Проверка статуса аутентификации
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  https://voxlibris.ru/api/auth/login

# Проверка JWT секрета
grep JWT_SECRET .env

# Проверка времени сервера
date
```

#### 2. Проблемы с загрузкой файлов

```bash
# Проверка статуса MinIO
docker-compose exec minio mc admin info local

# Проверка прав доступа
docker-compose exec minio mc policy get local/voxlibris

# Проверка дискового пространства
df -h
```

#### 3. Медленная работа базы данных

```sql
-- Медленные запросы
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Размер таблиц
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## API для администрирования

### Основные эндпоинты

```bash
# Пользователи
GET /api/admin/users                    # Список пользователей
GET /api/admin/users/:id               # Детали пользователя
PUT /api/admin/users/:id               # Обновление пользователя
DELETE /api/admin/users/:id            # Удаление пользователя

# Клубы
GET /api/admin/clubs                   # Список клубов
GET /api/admin/clubs/pending           # Клубы на модерации
POST /api/admin/clubs/:id/moderate     # Модерация клуба

# Контент
GET /api/admin/books                   # Список книг
GET /api/admin/books/pending           # Книги на модерации
POST /api/admin/books/:id/moderate     # Модерация книги

# Система
GET /api/admin/stats                   # Статистика системы
GET /api/admin/logs                    # Логи системы
POST /api/admin/backup                 # Создание backup
```

### Примеры запросов

```javascript
// Получение статистики
const stats = await fetch('/api/admin/stats', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
}).then(res => res.json());

// Блокировка пользователя
await fetch(`/api/admin/users/${userId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    status: 'banned',
    reason: 'Violation of community rules'
  })
});
```

## Автоматизация

### Скрипты администрирования

```bash
# Ежедневная очистка старых логов
#!/bin/bash
# scripts/cleanup-logs.sh
find /var/log/voxlibris -name "*.log" -mtime +30 -delete

# Еженедельное обновление статистики
#!/bin/bash
# scripts/update-stats.sh
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://voxlibris.ru/api/admin/stats/update
```

### Cron задачи

```bash
# Ежедневные задачи в 2:00
0 2 * * * /opt/voxlibris/scripts/backup.sh
0 2 * * * /opt/voxlibris/scripts/cleanup-logs.sh

# Еженедельные задачи в 3:00 (воскресенье)
0 3 * * 0 /opt/voxlibris/scripts/update-stats.sh
```

## Отчетность

### Генерация отчетов

```sql
-- Ежемесячный отчет активности
SELECT 
  DATE_TRUNC('month', created_at) as month,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) as total_events
FROM analytics_events 
WHERE created_at > NOW() - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- Отчет по популярным клубам
SELECT 
  c.name,
  c.description,
  COUNT(cm.user_id) as member_count,
  COUNT(CASE WHEN cm.role = 'moderator' THEN 1 END) as moderators
FROM clubs c
LEFT JOIN club_members cm ON c.id = cm.club_id
GROUP BY c.id, c.name, c.description
ORDER BY member_count DESC
LIMIT 10;
```

### Экспорт данных

```bash
# Экспорт пользователей
docker exec voxlibris_postgres \
  psql -U postgres -c "COPY users TO stdout WITH CSV HEADER" > users_export.csv

# Экспорт клубов
docker exec voxlibris_postgres \
  psql -U postgres -c "COPY clubs TO stdout WITH CSV HEADER" > clubs_export.csv
```

## Заключение

### Контакты поддержки

- **Техническая поддержка**: tech-support@voxlibris.ru
- **Безопасность**: security@voxlibris.ru
- **Срочные вопросы**: emergency@voxlibris.ru

### Полезные ссылки

- [Документация API](../05-server/api-routes/)
- [Развертывание](../11-deployment/)
- [База знаний](https://kb.voxlibris.ru)

---

Для получения дополнительной помощи обращайтесь к технической поддержке или создавайте issues в системе отслеживания проблем.