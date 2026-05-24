# Деплой

## Обзор

В этом разделе описаны скрипты и процессы, используемые для деплоя приложения VoxLibris в различные среды (development, staging, production).

## package.json скрипты

Скрипты деплоя определены в файле `package.json`:

```json
{
  "scripts": {
    "build": "npm run build:server && npm run build:client",
    "build:server": "rimraf dist && tsc --project tsconfig.server.json",
    "build:client": "cd client && npm run build",
    "start": "NODE_ENV=production node dist/server/index.js",
    "docker:build": "docker build -t voxlibris .",
    "docker:run": "docker run -p 5000:5000 --env-file .env voxlibris",
    "docker:deploy": "docker-compose -f docker-compose.prod.yml up -d"
  }
}
```

## Скрипты сборки

### `build`

```bash
pnpm run build
```

Выполняет полную сборку приложения для продакшена:

- Очищает директорию `dist/` с помощью `rimraf`
- Проверяет типы TypeScript
- Собирает серверную часть с помощью TypeScript компилятора
- Собирает клиентскую часть с помощью Vite

### `build:server`

```bash
pnpm run build:server
```

Собирает только серверную часть приложения в директорию `dist/`. Результатом является готовый к запуску JavaScript код с сохранением структуры директорий.

### `build:client`

```bash
pnpm run build:client
```

Собирает клиентскую часть приложения. Использует Vite для создания оптимизированных статических файлов, которые будут обслуживаться серверной частью.

## Скрипты запуска

### `start`

```bash
pnpm run start
```

Запускает собранное приложение в продакшн режиме. Предварительно необходимо выполнить `pnpm run build`.

## Docker-скрипты

### `docker:build`

```bash
pnpm run docker:build
```

Собирает Docker-образ приложения с тегом `voxlibris`. Использует `Dockerfile` из корня проекта.

### `docker:run`

```bash
pnpm run docker:run
```

Запускает контейнер с приложением, пробрасывая порт 5000 и используя переменные окружения из файла `.env`.

### `docker:deploy`

```bash
pnpm run docker:deploy
```

Запускает приложение в продакшн-окружении с помощью Docker Compose, используя файл `docker-compose.prod.yml`.

## Dockerfile

Конфигурация Docker-образа находится в файле `Dockerfile`:

```dockerfile
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm prune --prod

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 express
USER express
COPY --from=builder --chown=express:nodejs /app/dist ./dist
COPY --from=builder --chown=express:nodejs /app/package.json ./
COPY --from=builder --chown=express:nodejs /app/shared ./shared
RUN pnpm install --prod
EXPOSE 5000
CMD ["node", "dist/server/index.js"]
```

## Docker Compose конфигурации

### docker-compose.yml (development)

Конфигурация для разработки, включающая PostgreSQL и MinIO:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:14
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: voxlibris
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
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

### docker-compose.prod.yml (production)

Конфигурация для продакшена, включающая само приложение и зависимости:

```yaml
version: '3.8'
services:
  app:
    image: voxlibris:latest
    ports:
      - "5000:5000"
    env_file:
      - .env
    depends_on:
      - postgres
      - minio

  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: ${DATABASE_NAME}
      POSTGRES_USER: ${DATABASE_USER}
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  minio:
    image: minio/minio:latest
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

## Процесс деплоя

### Подготовка к деплою

1. Убедитесь, что все тесты проходят:
   ```bash
   pnpm run test
   ```

2. Выполните сборку:
   ```bash
   pnpm run build
   ```

3. Проверьте переменные окружения для продакшена

### Локальный деплой

1. Соберите Docker-образ:
   ```bash
   pnpm run docker:build
   ```

2. Запустите приложение:
   ```bash
   pnpm run docker:run
   ```

### Продакшн деплой

1. Убедитесь, что все изменения закоммичены
2. Обновите Docker-образ на сервере
3. Запустите приложение с помощью Docker Compose:
   ```bash
   pnpm run docker:deploy
   ```

## Автоматизация деплоя

Для автоматизации деплоя рекомендуется использовать CI/CD пайплайн, например, GitHub Actions:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup pnpm
      uses: pnpm/action-setup@v2
      with:
        version: 9
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'pnpm'
    
    - name: Install dependencies
      run: pnpm install
      
    - name: Run tests
      run: pnpm run test
      
    - name: Build application
      run: pnpm run build
      
    - name: Build and push Docker image
      run: |
        docker login -u ${{ secrets.DOCKER_USERNAME }} -p ${{ secrets.DOCKER_PASSWORD }}
        pnpm run docker:build
        docker tag voxlibris ${{ secrets.DOCKER_USERNAME }}/voxlibris:${{ github.sha }}
        docker push ${{ secrets.DOCKER_USERNAME }}/voxlibris:${{ github.sha }}
```

## Мониторинг и логирование

После деплоя рекомендуется настроить:

- Мониторинг состояния приложения
- Сбор и анализ логов
- Уведомления о сбоях
- Ротацию логов

## Рекомендации

1. Всегда тестируйте деплой в staging-среде перед продакшеном
2. Используйте тегирование Docker-образов для возможности отката
3. Обеспечьте резервное копирование данных
4. Настройте автоматическое масштабирование при необходимости
5. Используйте безопасные методы хранения секретов
6. Регулярно обновляйте зависимости и базовые образы
7. Настройте уведомления о состоянии деплоя