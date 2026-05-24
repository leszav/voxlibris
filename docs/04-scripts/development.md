# Разработка

## Обзор

В этом разделе описаны скрипты, используемые для локальной разработки приложения VoxLibris.

## package.json скрипты

Основные скрипты для разработки определены в файле `package.json`:

```json
{
  "scripts": {
    "dev": "concurrently \"npm:dev:*\"",
    "dev:server": "tsx watch --env-file=.env ./server/index.ts",
    "dev:client": "vite --host",
    "dev:server-only": "tsx watch --env-file=.env ./server/index.ts",
    "dev:client-only": "cd client && vite",
    
    "build": "npm run build:server && npm run build:client",
    "build:server": "rimraf dist && tsc --project tsconfig.server.json",
    "build:client": "cd client && npm run build",
    
    "start": "NODE_ENV=production node dist/server/index.js",
    "start:dev": "npm run dev",
    
    "lint": "eslint . --ext .ts,.tsx --fix",
    "lint:check": "eslint . --ext .ts,.tsx",
    "check": "tsc --noEmit",
    
    "test": "npm run test:server && npm run test:client",
    "test:server": "node --test ./server/**/*.test.ts",
    "test:client": "cd client && npm run test",
    
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx ./server/database/migrate.ts",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    
    "init-storage": "mkdir -p storage/books storage/covers storage/records"
  }
}
```

## Скрипты разработки

### `dev`

```bash
pnpm run dev
```

Запускает приложение в режиме разработки с использованием `concurrently`. Этот скрипт одновременно запускает сервер и клиентскую часть приложения:

- Сервер запускается с hot-reload с помощью `tsx watch`
- Клиент запускается с помощью `vite` с поддержкой HMR (Hot Module Replacement)

### `dev:server`

```bash
pnpm run dev:server
```

Запускает только серверную часть приложения в режиме разработки с автоматической перезагрузкой при изменении файлов.

### `dev:client`

```bash
pnpm run dev:client
```

Запускает только клиентскую часть приложения с помощью Vite.

### `dev:server-only` и `dev:client-only`

```bash
pnpm run dev:server-only
pnpm run dev:client-only
```

Отдельные скрипты для запуска только сервера или только клиента.

## Скрипты сборки

### `build`

```bash
pnpm run build
```

Выполняет полную сборку приложения, включающую:

- Очистку старой сборки
- Проверку типов TypeScript
- Сборку серверной части с помощью TypeScript
- Сборку клиентской части с помощью Vite

### `build:server`

```bash
pnpm run build:server
```

Собирает только серверную часть приложения.

### `build:client`

```bash
pnpm run build:client
```

Собирает только клиентскую часть приложения.

## Скрипты проверки качества кода

### `lint`

```bash
pnpm run lint
```

Выполняет проверку и автоматическое исправление кода с помощью ESLint.

### `lint:check`

```bash
pnpm run lint:check
```

Выполняет проверку кода с помощью ESLint без автоматических исправлений.

### `check`

```bash
pnpm run check
```

Выполняет проверку типов TypeScript без генерации файлов.

## Скрипты тестирования

### `test`

```bash
pnpm run test
```

Запускает тесты как для серверной, так и для клиентской части приложения.

### `test:server`

```bash
pnpm run test:server
```

Запускает только серверные тесты с использованием встроенного в Node.js тестового раннера.

### `test:client`

```bash
pnpm run test:client
```

Запускает только клиентские тесты.

## Скрипты работы с базой данных

### `db:generate`

```bash
pnpm run db:generate
```

Генерирует миграции из изменений в схеме базы данных с помощью Drizzle Kit.

### `db:migrate`

```bash
pnpm run db:migrate
```

Применяет миграции к базе данных.

### `db:push`

```bash
pnpm run db:push
```

Прямое применение изменений схемы к базе данных без создания миграции (полезно в процессе разработки).

### `db:studio`

```bash
pnpm run db:studio
```

Запускает Drizzle Studio - визуальный интерфейс для работы с базой данных.

## Вспомогательные скрипты

### `init-storage`

```bash
pnpm run init-storage
```

Создает директории для хранения книг, обложек и записей:

- `storage/books` - для хранения загруженных книг
- `storage/covers` - для хранения обложек книг
- `storage/records` - для хранения аудиозаписей сессий

## Рекомендации по использованию

1. Используйте `pnpm run dev` для обычной разработки
2. Используйте `pnpm run dev:server-only` или `pnpm run dev:client-only` при необходимости работать только с одной частью
3. Регулярно запускайте `pnpm run lint` и `pnpm run check` перед коммитом
4. Используйте `pnpm run db:push` для быстрого применения изменений схемы в процессе разработки
5. Запускайте `pnpm run test` перед созданием pull request
6. Используйте `pnpm run build` для проверки корректности сборки перед деплоем