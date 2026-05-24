# Миграции

## Обзор

Миграции в приложении VoxLibris управляются с помощью Drizzle ORM. Они позволяют безопасно изменять структуру базы данных с течением времени, обеспечивая согласованность между различными средами.

## Структура файлов

Миграции находятся в директории `migrations/` в корне проекта:

```
migrations/
├── 0000_initial.sql
├── 0001_add_clubs_table.sql
├── 0002_add_books_table.sql
├── 0003_add_reading_sessions_table.sql
├── 0004_add_reactions_questions_tables.sql
├── 0005_add_notifications_table.sql
├── 0006_add_scheduled_sessions_table.sql
├── ...
```

Каждая миграция - это SQL-файл с уникальным номером, который указывает на порядок применения.

## Генерация миграций

### Автоматическая генерация

Для автоматической генерации миграций используется команда:

```bash
pnpm run db:generate
```

Эта команда:
1. Сравнивает текущую схему в `server/database/schema.ts` с последним состоянием базы данных
2. Генерирует SQL-скрипт, который изменяет базу данных до нового состояния
3. Сохраняет его в новый файл миграции с увеличенным номером

### Пример процесса генерации

Предположим, вы добавили новое поле в схему:

```typescript
// В файле server/database/schema.ts
export const users = pgTable('users', {
  // ... существующие поля ...
  bio: text('bio'), // Новое поле
});
```

После выполнения `pnpm run db:generate` будет создан файл `0007_add_bio_to_users.sql`:

```sql
ALTER TABLE "users" ADD COLUMN "bio" text;
```

## Применение миграций

### К команде

```bash
pnpm run db:migrate
```

Применяет все непримененные миграции к базе данных. Выполняет файл `server/database/migrate.ts`, который использует Drizzle ORM для выполнения миграций.

### Содержимое migrate.ts

```typescript
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client'; // экземпляр Drizzle ORM

async function runMigrations() {
  console.log('Starting migrations...');
  
  await migrate(db, { migrationsFolder: './migrations' });
  
  console.log('Migrations completed!');
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

### Прямое применение изменений

```bash
pnpm run db:push
```

Применяет изменения из схемы напрямую к базе данных без создания миграции. Полезно в процессе разработки для быстрого тестирования изменений.

## Структура миграционного файла

Каждый миграционный файл содержит SQL-операторы для обновления схемы:

```sql
-- 0003_add_reading_sessions_table.sql
-- Migration UP
CREATE TABLE "reading_sessions" (
  "id" serial PRIMARY KEY,
  "book_id" integer NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  "club_id" integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  "host_id" integer NOT NULL REFERENCES users(id),
  "started_at" timestamp DEFAULT now(),
  "ended_at" timestamp,
  "status" varchar(20) DEFAULT 'active',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX idx_reading_sessions_book ON reading_sessions(book_id);
CREATE INDEX idx_reading_sessions_club ON reading_sessions(club_id);
CREATE INDEX idx_reading_sessions_host ON reading_sessions(host_id);

-- Migration DOWN (для отката)
/*
DROP INDEX IF EXISTS idx_reading_sessions_host;
DROP INDEX IF EXISTS idx_reading_sessions_club;
DROP INDEX IF EXISTS idx_reading_sessions_book;
DROP TABLE "reading_sessions";
*/
```

> Примечание: Drizzle ORM не поддерживает откат миграций напрямую. Комментарии вверху показывают, как можно откатить изменения вручную.

## Стратегии миграции

### 1. Невозмущающие изменения

Невозмущающие (non-breaking) изменения могут быть применены без простоя:

- Добавление нового столбца с значением по умолчанию или NULL
- Добавление новой таблицы
- Добавление индекса

Пример:
```sql
-- Невозмущающая миграция
ALTER TABLE "users" ADD COLUMN "bio" text DEFAULT NULL;
```

### 2. Возмущающие изменения

Изменения, которые могут повлиять на работающее приложение:

- Удаление столбца или таблицы
- Изменение типа данных столбца
- Изменение ограничений

Для таких изменений требуется особое внимание:
- Обновление приложения до совместимости с новой схемой
- Обновление схемы
- Удаление старого кода

## Рекомендации по написанию миграций

### 1. Проверка в тестовой среде

Всегда тестируйте миграции в изолированной среде перед применением в продакшене:

```bash
# Создание тестовой базы данных
createdb voxlibris_test

# Применение миграций
DATABASE_URL="postgresql://user:pass@localhost/voxlibris_test" pnpm run db:migrate
```

### 2. Обработка ошибок

Добавляйте проверки в миграции, чтобы избежать ошибок при повторном запуске:

```sql
-- Хорошо: проверка существования перед добавлением
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_status_enum') THEN
    CREATE TYPE session_status_enum AS ENUM ('scheduled', 'active', 'finished');
  END IF;
END$$;

ALTER TABLE "reading_sessions" ADD COLUMN IF NOT EXISTS "status" session_status_enum DEFAULT 'scheduled';
```

### 3. Обновление данных

Если миграция изменяет структуру, возможно, потребуется обновить существующие данные:

```sql
-- Добавление нового столбца
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" varchar(20) DEFAULT 'member';

-- Обновление существующих записей
UPDATE "users" SET "role" = 'member' WHERE "role" IS NULL;
```

## Проверка состояния миграций

### Проверка схемы

```bash
pnpm run db:validate
```

Проверяет, все ли миграции применены к базе данных.

### Просмотр схемы

```bash
pnpm run db:studio
```

Запускает Drizzle Studio для визуального просмотра структуры базы данных.

## Восстановление после сбоев

Если миграция завершилась с ошибкой:

1. Проверьте логи для определения причины сбоя
2. При необходимости вручную исправьте состояние базы данных
3. Обновите файл миграции
4. Повторно примените миграцию
5. Проверьте целостность данных

### Пример восстановления

Если миграция была частично применена:

```sql
-- Проверьте, какие миграции были применены
SELECT * FROM drizzle_migrations ORDER BY id DESC LIMIT 5;

-- Если нужно откатить частично примененную миграцию
-- вручную выполните обратные SQL-операции
ALTER TABLE "reading_sessions" DROP COLUMN IF EXISTS "current_chapter";

-- Удалите запись о миграции, чтобы можно было повторно применить
DELETE FROM drizzle_migrations WHERE id = 3;
```

## Процесс разработки

### 1. Изменение схемы

Измените файл `server/database/schema.ts` в соответствии с новыми требованиями.

### 2. Генерация миграции

```bash
pnpm run db:generate
```

### 3. Проверка сгенерированного файла

Проверьте файл миграции на корректность и безопасность:

- Не содержит ли он потенциально опасных операций?
- Корректно ли обрабатываются NULL значения?
- Есть ли необходимые индексы?

### 4. Тестирование

Примените миграцию к тестовой базе данных.

### 5. Коммит изменений

Коммитите изменения схемы и файл миграции:

```bash
git add server/database/schema.ts migrations/0xxx_*.sql
git commit -m "Add bio field to users table with migration"
```

## Рекомендации

1. Всегда создавайте бэкап базы данных перед применением миграций в продакшене
2. Тестируйте миграции в среде, максимально приближенной к продакшену
3. Используйте транзакции для миграций, когда это возможно
4. Пишите миграции, которые можно безопасно применить несколько раз
5. Документируйте сложные миграции в комментариях
6. Обновляйте документацию схемы после значительных изменений
7. Планируйте время для применения миграций, особенно возмущающих
8. Используйте feature flags для поэтапного внедрения изменений