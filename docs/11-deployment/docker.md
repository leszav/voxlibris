# Docker

## Обзор

В этом разделе описана контейнеризация приложения VoxLibris с использованием Docker. Docker позволяет упаковать приложение и все его зависимости в изолированные контейнеры, что обеспечивает согласованность работы приложения в различных средах.

## Структура файлов

Конфигурационные файлы Docker находятся в корне проекта:

```
/
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── docker-compose.dev.yml
└── .dockerignore
```

## Dockerfile

Dockerfile определяет, как будет собран контейнер приложения:

```dockerfile
# Используем официальный Node.js runtime как родительский образ
FROM node:20-alpine AS deps

# Устанавливаем зависимости для alpine
RUN apk add --no-cache libc6-compat

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY package.json pnpm-lock.yaml ./

# Устанавливаем зависимости через pnpm
RUN npm install -g pnpm && pnpm install --frozen-lockfile


# Сборка приложения
FROM node:20-alpine AS builder

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем зависимости из предыдущего этапа
COPY --from=deps /app/node_modules ./node_modules

# Копируем исходный код
COPY . .

# Запускаем сборку
RUN pnpm run build


# Запуск приложения
FROM node:20-alpine AS runner

# Устанавливаем рабочую директорию
WORKDIR /app

# Устанавливаем production переменную окружения
ENV NODE_ENV production

# Создаем системного пользователя для безопасности
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 express

# Переходим на созданного пользователя
USER express

# Копируем собранные файлы из этапа builder
COPY --from=builder --chown=express:nodejs /app/dist ./dist
COPY --from=builder --chown=express:nodejs /app/package.json ./
COPY --from=builder --chown=express:nodejs /app/shared ./shared
COPY --from=builder --chown=express:nodejs /app/migrations ./migrations

# Устанавливаем production зависимости
RUN pnpm install --prod

# Открываем порт, который будет использоваться для доступа к приложению
EXPOSE 5000

# Запускаем приложение
CMD ["node", "dist/server/index.js"]
```

## Docker Compose

### docker-compose.yml (для разработки)

Файл `docker-compose.yml` определяет сервисы, необходимые для разработки:

```yaml
version: '3.8'

services:
  # Основное приложение
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "5000:5000"  # Основной порт приложения
      - "3000:3000"  # Порт для клиентской части (если используется в dev-режиме)
    depends_on:
      - postgres
      - minio
    environment:
      - DATABASE_URL=postgresql://voxlibris:password@postgres:5432/voxlibris
      - S3_ENDPOINT=http://minio:9000
      - S3_ACCESS_KEY_ID=minioadmin
      - S3_SECRET_ACCESS_KEY=minioadmin
      - S3_BUCKET_NAME=voxlibris-bucket
      - NODE_ENV=development
    volumes:
      - .:/app
      - /app/node_modules
    command: sh -c "pnpm run db:push && pnpm run dev"

  # База данных PostgreSQL
  postgres:
    image: postgres:14
    restart: always
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: voxlibris
      POSTGRES_USER: voxlibris
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql

  # MinIO (S3-совместимое хранилище)
  minio:
    image: minio/minio:latest
    restart: always
    ports:
      - "9000:9000"  # API
      - "9001:9001"  # Консоль
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  minio_data:
```

### docker-compose.prod.yml (для продакшена)

Файл `docker-compose.prod.yml` определяет конфигурацию для продакшена:

```yaml
version: '3.8'

services:
  # Основное приложение
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    depends_on:
      - postgres
      - minio
    environment:
      - DATABASE_URL=postgresql://voxlibris:password@postgres:5432/voxlibris
      - S3_ENDPOINT=http://minio:9000
      - S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
      - S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
      - S3_BUCKET_NAME=${S3_BUCKET_NAME}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - SMTP_FROM=${SMTP_FROM}
      - FRONTEND_URL=${FRONTEND_URL}
      - NODE_ENV=production
    restart: always

  # База данных PostgreSQL
  postgres:
    image: postgres:14
    restart: always
    environment:
      POSTGRES_DB: ${DATABASE_NAME}
      POSTGRES_USER: ${DATABASE_USER}
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: always

  # MinIO (S3-совместимое хранилище)
  minio:
    image: minio/minio:latest
    restart: always
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY_ID}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_ACCESS_KEY}
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    restart: always

volumes:
  postgres_data:
  minio_data:
```

### docker-compose.dev.yml (для разработки с hot-reload)

Файл `docker-compose.dev.yml` для разработки с возможностью hot-reload:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "5000:5000"
      - "9229:9229"  # Для отладки
    depends_on:
      - postgres
      - minio
    environment:
      - DATABASE_URL=postgresql://voxlibris:password@postgres:5432/voxlibris
      - S3_ENDPOINT=http://minio:9000
      - S3_ACCESS_KEY_ID=minioadmin
      - S3_SECRET_ACCESS_KEY=minioadmin
      - S3_BUCKET_NAME=voxlibris-bucket
      - NODE_ENV=development
    volumes:
      - .:/app
      - /app/node_modules
    command: sh -c "pnpm install && pnpm run dev"

volumes:
  postgres_data:
  minio_data:
```

## .dockerignore

Файл `.dockerignore` определяет, какие файлы и директории не будут включены в контекст сборки:

```
node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.nyc_output
coverage
.nyc_output
.coverage
.vscode
.idea
.DS_Store
dist
```

## Сборка и запуск

### Сборка контейнера

```bash
# Сборка контейнера
docker build -t voxlibris .

# Сборка контейнера с кэшированием
docker build --cache-from voxlibris:latest -t voxlibris .
```

### Запуск с Docker Compose

```bash
# Запуск для разработки
docker-compose up

# Запуск в фоновом режиме
docker-compose up -d

# Запуск для продакшена
docker-compose -f docker-compose.prod.yml up -d

# Запуск для разработки с hot-reload
docker-compose -f docker-compose.dev.yml up
```

### Проверка состояния

```bash
# Проверка запущенных контейнеров
docker ps

# Проверка логов
docker logs <container-id>

# Проверка логов конкретного сервиса
docker-compose logs app
```

## Миграции базы данных

Для выполнения миграций в контейнеризированной среде:

```bash
# Выполнение миграций
docker-compose exec app pnpm run db:migrate

# Генерация миграций (если возможно в контейнере)
docker-compose exec app pnpm run db:generate
```

## Оптимизация

### Multi-stage builds

Dockerfile использует многоступенчатую сборку для уменьшения размера финального образа:

1. **deps stage**: Установка зависимостей
2. **builder stage**: Сборка приложения
3. **runner stage**: Запуск приложения с минимальными зависимостями

### Использование .dockerignore

Правильное использование .dockerignore ускоряет сборку и уменьшает размер образа.

### Управление слоями

Docker кэширует слои, поэтому важно правильно упорядочить команды в Dockerfile:

- Неизменяемые зависимости копируются раньше
- Часто изменяемый код копируется позже

## Безопасность

### Non-root пользователь

Финальный образ запускается под non-root пользователем для повышения безопасности:

```dockerfile
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 express
USER express
```

### Изоляция сервисов

Каждый сервис изолирован в своем контейнере, что повышает безопасность и надежность.

## Рекомендации

1. Используйте многоступенчатую сборку для уменьшения размера образа
2. Обновляйте зависимости регулярно
3. Используйте тегирование образов для версионирования
4. Используйте secrets для хранения чувствительных данных
5. Проверяйте образы на наличие уязвимостей
6. Используйте минимальные базовые образы
7. Правильно настраивайте volumes для хранения данных
8. Используйте health checks для проверки состояния контейнеров
9. Мониторьте использование ресурсов контейнерами
10. Используйте Docker Compose для управления многоконтейнерными приложениями