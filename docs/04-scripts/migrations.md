# Миграции

## Обзор

В проекте VoxLibris используется Drizzle ORM для управления схемой базы данных и миграциями. Миграции позволяют безопасно изменять структуру базы данных с течением времени, обеспечивая согласованность между различными средами.

## Местоположение миграций

Миграции находятся в директории `migrations/` в корне проекта:

```
migrations/
├── 0000_initial.sql
├── 0001_add_clubs_table.sql
├── 0002_add_books_table.sql
├── 0003_add_reading_sessions_table.sql
├── ...
```

Каждая миграция представляет собой SQL-файл с уникальным префиксом-номером.

## package.json скрипты

Скрипты для работы с миграциями определены в файле `package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx ./server/database/migrate.ts",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:drop": "drizzle-kit drop --force",
    "db:validate": "drizzle-kit validate"
  }
}
```

## Скрипты миграций

### `db:generate`

```bash
pnpm run db:generate
```

Генерирует SQL-скрипт миграции на основе изменений в файле схемы (`server/database/schema.ts`). Drizzle Kit сравнивает текущую схему с последней примененной миграцией и создает новый файл миграции с необходимыми изменениями.

### `db:migrate`

```bash
pnpm run db:migrate
```

Применяет непримененные миграции к базе данных. Запускает файл `server/database/migrate.ts`, который использует Drizzle ORM для выполнения миграций.

Пример файла `migrate.ts`:

```typescript
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { pool } from './connection'; // Подключение к базе данных
import { db } from './client'; // Экземпляр Drizzle ORM

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

### `db:push`

```bash
pnpm run db:push
```

Прямое применение изменений схемы к базе данных без создания миграции. Полезно в процессе разработки для быстрого тестирования изменений. Drizzle Kit напрямую применяет изменения из файла схемы к базе данных.

### `db:studio`

```bash
pnpm run db:studio
```

Запускает Drizzle Studio - веб-интерфейс для визуального просмотра и редактирования структуры базы данных.

### `db:drop`

```bash
pnpm run db:drop
```

Удаляет все таблицы из базы данных. Используется с осторожностью, особенно в продакшене.

### `db:validate`

```bash
pnpm run db:validate
```

Проверяет, все ли миграции применены к базе данных, и соответствует ли схема базы данных файлам миграций.

## Структура миграций

Каждая миграция состоит из двух частей:

1. **Up-миграция**: Применяет изменения к базе данных
2. **Down-миграция**: Откатывает изменения (для возможного отката)

Пример содержимого миграционного файла `0003_add_reading_sessions_table.sql`:

```sql
-- Migration UP
CREATE TABLE "reading_sessions" (
  "id" serial PRIMARY KEY,
  "club_id" integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  "book_id" integer NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  "started_at" timestamp DEFAULT now(),
  "ended_at" timestamp,
  "created_by" integer NOT NULL REFERENCES users(id),
  "status" varchar(50) DEFAULT 'scheduled'
);

CREATE INDEX idx_reading_sessions_club ON reading_sessions(club_id);
CREATE INDEX idx_reading_sessions_book ON reading_sessions(book_id);

-- Migration DOWN
DROP TABLE "reading_sessions";
```

## Работа с миграциями

### Создание новой миграции

1. Измените файл схемы в `server/database/schema.ts`
2. Сгенерируйте миграцию:
   ```bash
   pnpm run db:generate
   ```
3. Проверьте сгенерированный файл миграции
4. При необходимости внесите корректировки

### Применение миграций

1. Убедитесь, что база данных доступна
2. Выполните миграции:
   ```bash
   pnpm run db:migrate
   ```

### Откат миграций

Drizzle ORM не предоставляет встроенного инструмента для отката миграций. Для отката требуется создание новой миграции, которая отменяет изменения предыдущей миграции.

## Файл схемы

Центральным элементом системы миграций является файл схемы `server/database/schema.ts`, который описывает структуру базы данных в TypeScript:

```typescript
import { pgTable, serial, text, integer, timestamp, varchar, boolean, json } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).default('user'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const clubs = pgTable('clubs', {
  id: serial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: integer('owner_id').references(() => users.id).notNull(),
  isPublic: boolean('is_public').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

## Рекомендации по работе с миграциями

1. Всегда тестируйте миграции в изолированной среде перед применением в продакшене
2. Делайте бэкап базы данных перед применением миграций
3. Пишите миграции, которые можно безопасно применить несколько раз
4. Используйте транзакции при необходимости для обеспечения атомарности изменений
5. Проверяйте влияние миграций на производительность в больших базах данных
6. Обновляйте документацию после значительных изменений схемы
7. Используйте `db:push` только в процессе разработки, не в продакшене
8. Регулярно проверяйте актуальность схемы с помощью `db:validate`

## Обработка ошибок миграций

Если миграция завершается с ошибкой:

1. Проверьте логи на предмет причин ошибки
2. При необходимости вручную исправьте состояние базы данных
3. Обновите файл миграции при необходимости
4. Повторно примените миграцию
5. Запустите `db:validate`, чтобы убедиться в согласованности

## Автоматизация в CI/CD

В процессе CI/CD рекомендуется:

1. Проверять валидность миграций
2. Применять миграции к тестовой базе данных
3. Проверять совместимость миграций с существующим кодом
4. Только после прохождения тестов применять миграции в продакшене