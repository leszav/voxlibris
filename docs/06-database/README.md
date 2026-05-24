# База данных

В этом разделе описана структура базы данных, миграции и лучшие практики работы с данными в проекте VoxLibris.

## Обзор

VoxLibris использует **PostgreSQL** в качестве основной базы данных и **Drizzle ORM** для работы с данными.

### Технологический стек

- **PostgreSQL 14+** - основная реляционная база данных
- **Drizzle ORM** - современный TypeScript ORM
- **Redis** - для кэширования и сессий
- **MinIO** - для файлового хранения (не база данных, но связано с данными)

## Структура базы данных

### Основные таблицы

#### Пользователи и аутентификация
- **`users`** - основная информация о пользователях
- **`user_profiles`** - расширенные профили пользователей
- **`password_reset_tokens`** - токены сброса пароля

#### Книги и контент
- **`books`** - информация о книгах
- **`book_files`** - файлы книг
- **`genres`** - жанры книг
- **`book_genres`** - связь книг с жанрами

#### Клубы и сообщества
- **`clubs`** - книжные клубы
- **`club_members`** - участники клубов
- **`club_books`** - книги в клубах
- **`club_reading_plans`** - планы чтения

#### Сессии чтения
- **`reading_sessions`** - сессии чтения
- **`session_listeners`** - участники сессий
- **`reading_progress`** - прогресс чтения
- **`reading_status_tracking`** - статус чтения

#### Комментарии и обсуждения
- **`book_comments`** - комментарии к книгам
- **`club_discussions`** - обсуждения в клубах

#### Уведомления
- **`notifications`** - системные уведомления
- **`notification_settings`** - настройки уведомлений

#### Аналитика и метрики
- **`analytics_events`** - события аналитики
- **`reading_analytics`** - аналитика чтения
- **`book_access_logs`** - логи доступа к книгам

#### Геймификация
- **`user_achievements`** - достижения пользователей
- **`gamification_rules`** - правила геймификации

#### Социальные функции
- **`social_graph`** - социальные связи
- **`activity_feed`** - лента активности
- **`direct_messages`** - личные сообщения

## Миграции

### Структура миграций

```
migrations/
├── 0000_users_and_auth.sql
├── 0001_books_and_content.sql
├── 0002_clubs_and_members.sql
├── ...
├── 0046_add_recommendations.sql
├── seed_data.sql
└── gamifications_seed_data.sql
```

### Запуск миграций

```bash
# Применить все миграции
pnpm run db:migrate

# Применить конкретную миграцию
pnpm run db:migrate -- --to 0003_club_features.sql

# Создать новую миграцию
pnpm run db:generate

# Откатить миграции
pnpm run db:migrate -- --down
```

### Название миграций

Миграции следуют формату: `XXXX_descriptive_name.sql`

- **XXXX** - порядковый номер с лидирующими нулями
- **descriptive_name** - описательное имя на английском

## Schema определение

### Основной файл схемы

Файл `shared/schema.ts` содержит определение всех таблиц:

```typescript
import { pgTable, serial, varchar, timestamp, boolean, ... } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).default('user').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### Лучшие практики

1. **Используйте TypeScript типы** для всех полей
2. **Добавляйте ограничения** (constraints) на уровне базы данных
3. **Используйте индексы** для часто запрашиваемых полей
4. **Документируйте сложные связи** между таблицами

## Работа с данными

### Repository паттерн

Используйте repository pattern для инкапсуляции логики работы с данными:

```typescript
// server/repositories/user-repository.ts
export class UserRepository {
  constructor(private db: DrizzleDB) {}

  async findById(id: number): Promise<User | null> {
    const users = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    
    return users[0] || null;
  }

  async create(userData: InsertUser): Promise<User> {
    const users = await this.db
      .insert(usersTable)
      .values(userData)
      .returning();
    
    return users[0];
  }
}
```

### Транзакции

```typescript
import { db } from '../db';

export async function transferBookOwnership(
  bookId: number,
  fromUserId: number,
  toUserId: number
) {
  return await db.transaction(async (tx) => {
    // Обновляем владельца книги
    await tx
      .update(booksTable)
      .set({ ownerId: toUserId })
      .where(eq(booksTable.id, bookId));
    
    // Записываем в лог
    await tx.insert(bookAccessLogs).values({
      bookId,
      userId: toUserId,
      action: 'ownership_transferred',
      metadata: { fromUserId }
    });
  });
}
```

## Seed данные

### Основные seed файлы

- **`seed_data.sql`** - основные тестовые данные
- **`gamifications_seed_data.sql`** - данные для геймификации

### Запуск seed

```bash
# Заполнить базу тестовыми данными
pnpm run db:seed

# Заполнить только геймификацию
pnpm run db:seed -- --gamification
```

## Производительность

### Индексы

Оптимизированные индексы для основных запросов:

```sql
-- Индексы для пользователей
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- Индексы для книг
CREATE INDEX idx_books_owner_id ON books(owner_id);
CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_created_at ON books(created_at);

-- Индексы для сессий
CREATE INDEX idx_reading_sessions_club_id ON reading_sessions(club_id);
CREATE INDEX idx_reading_sessions_scheduled_at ON reading_sessions(scheduled_at);
```

### Оптимизация запросов

```typescript
// Плохой запрос - N+1 проблема
const sessions = await db.select().from(readingSessions);
for (const session of sessions) {
  const participants = await db
    .select()
    .from(sessionListeners)
    .where(eq(sessionListeners.sessionId, session.id));
}

// Хороший запрос - с join
const sessionsWithParticipants = await db
  .select({
    session: readingSessions,
    participants: sessionListeners
  })
  .from(readingSessions)
  .leftJoin(sessionListeners, eq(readingSessions.id, sessionListeners.sessionId));
```

## Backup и восстановление

### Backup

```bash
# Полный backup
pg_dump -h localhost -U postgres voxlibris > backup_$(date +%Y%m%d).sql

# Только данные
pg_dump -h localhost -U postgres --data-only voxlibris > data_backup_$(date +%Y%m%d).sql

# Только схема
pg_dump -h localhost -U postgres --schema-only voxlibris > schema_backup_$(date +%Y%m%d).sql
```

### Восстановление

```bash
# Восстановление из backup
psql -h localhost -U postgres voxlibris < backup_20240524.sql

# Восстановление только данных
psql -h localhost -U postgres voxlibris < data_backup_20240524.sql
```

## Мониторинг

### Основные метрики

1. **Количество активных соединений**
2. **Время выполнения запросов**
3. **Размер таблиц**
4. **Использование индексов**

### запросы для мониторинга

```sql
-- Активные соединения
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

## Медленные запросы
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

## Безопасность

### Права доступа

```sql
-- Только чтение для аналитики
CREATE ROLE analytics_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_reader;

-- Права для приложения
CREATE ROLE voxlibris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO voxlibris_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO voxlibris_app;
```

### Аудит

```sql
-- Включаем аудит для важных таблиц
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Политика аудита
CREATE POLICY audit_users ON users
  FOR ALL TO voxlibris_app
  USING (true)
  WITH CHECK (true);
```

## Заключение

Для получения дополнительной информации:

- [Drizzle ORM документация](https://orm.drizzle.team/)
- [PostgreSQL документация](https://www.postgresql.org/docs/)
- [Миграции](../migrations/)
- [Repository примеры](../server/repositories/)

---

Если у вас есть вопросы по работе с базой данных, обращайтесь к команде или создавайте issues.