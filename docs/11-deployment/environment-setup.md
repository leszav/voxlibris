# Настройка окружения

## Обзор

В этом разделе описана настройка различных окружений для приложения VoxLibris: разработки, тестирования и продакшена. Правильная настройка окружений обеспечивает стабильную работу приложения в различных средах.

## Структура файлов

Конфигурационные файлы окружения находятся в корне проекта:

```
/
├── .env.example
├── .env.development
├── .env.production
├── .env.test
└── server/
    └── config/
        ├── config.ts
        └── environment.ts
```

## Переменные окружения

### .env.example

Файл `.env.example` содержит все возможные переменные с примерами значений:

```
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/voxlibris"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-here"

# File Storage (MinIO or AWS S3)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=voxlibris-bucket
S3_REGION=us-east-1

# Email Configuration (for notifications)
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=username
SMTP_PASS=password
SMTP_FROM=noreply@example.com

# Frontend URL (for CORS and redirects)
FRONTEND_URL=http://localhost:3000

# Audio Broadcasting
AUDIO_BROADCAST_PORT=8000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

### .env.development

Конфигурация для разработки:

```
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DATABASE_URL="postgresql://dev_user:dev_password@localhost:5432/voxlibris_dev"

# JWT Configuration
JWT_SECRET="dev_secret_key_for_testing_only"
JWT_REFRESH_SECRET="dev_refresh_secret_for_testing_only"

# File Storage (using local MinIO)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=voxlibris-dev-bucket
S3_REGION=local

# Email Configuration (using MailHog for development)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@dev.voxlibris.local

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Audio Broadcasting
AUDIO_BROADCAST_PORT=8000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=debug
```

### .env.production

Конфигурация для продакшена:

```
# Server Configuration
PORT=5000
NODE_ENV=production

# Database Configuration
DATABASE_URL="postgresql://prod_user:secure_password@db-host:5432/voxlibris_prod"

# JWT Configuration
JWT_SECRET="long_secure_production_secret_here_with_at_least_32_characters"
JWT_REFRESH_SECRET="another_long_secure_production_secret_here"

# File Storage (using AWS S3 or production MinIO)
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY_ID=your_aws_access_key_id
S3_SECRET_ACCESS_KEY=your_aws_secret_access_key
S3_BUCKET_NAME=voxlibris-prod-bucket
S3_REGION=us-east-1

# Email Configuration (using production SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_app_specific_password
SMTP_FROM=noreply@voxlibris.app

# Frontend URL
FRONTEND_URL=https://voxlibris.app

# Audio Broadcasting
AUDIO_BROADCAST_PORT=8000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=50

# Logging
LOG_LEVEL=warn
```

### .env.test

Конфигурация для тестирования:

```
# Server Configuration
PORT=5001
NODE_ENV=test

# Database Configuration
DATABASE_URL="postgresql://test_user:test_password@localhost:5432/voxlibris_test"

# JWT Configuration
JWT_SECRET="test_secret_for_testing"
JWT_REFRESH_SECRET="test_refresh_secret_for_testing"

# File Storage (using separate test bucket)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=voxlibris-test-bucket
S3_REGION=test-region

# Email Configuration (disabled for tests)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@test.voxlibris.local

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Audio Broadcasting
AUDIO_BROADCAST_PORT=8001

# Rate Limiting (more permissive for tests)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Logging
LOG_LEVEL=error
```

## Управление конфигурацией

### server/config/config.ts

Файл `server/config/config.ts` управляет загрузкой и валидацией конфигурации:

```typescript
import { z } from 'zod';

// Схема валидации конфигурации
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'Refresh token secret must be at least 32 characters'),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET_NAME: z.string(),
  S3_REGION: z.string(),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number(),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  SMTP_FROM: z.string().email(),
  FRONTEND_URL: z.string().url(),
  AUDIO_BROADCAST_PORT: z.coerce.number().default(8000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

// Тип для конфигурации
export type Config = z.infer<typeof envSchema>;

// Загрузка и валидация конфигурации
export function loadConfig(): Config {
  try {
    // Загрузка переменных из .env файлов
    if (process.env.NODE_ENV === 'development') {
      require('dotenv').config({ path: '.env.development' });
    } else if (process.env.NODE_ENV === 'test') {
      require('dotenv').config({ path: '.env.test' });
    } else if (process.env.NODE_ENV === 'production') {
      require('dotenv').config({ path: '.env.production' });
    } else {
      // Загрузка .env по умолчанию
      require('dotenv').config();
    }

    // Валидация переменных окружения
    const parsed = envSchema.parse(process.env);
    
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const { fieldErrors } = error.flatten();
      const errorMessage = Object.entries(fieldErrors)
        .map(([field, errors]) => `${field}: ${errors?.join(', ')}`)
        .join('\n  ');
      
      throw new Error(`Configuration validation failed:\n  ${errorMessage}`);
    }
    
    throw error;
  }
}

// Глобальная переменная конфигурации
export const config = loadConfig();
```

### server/config/environment.ts

Файл `server/config/environment.ts` содержит утилиты для работы с окружением:

```typescript
import { config } from './config';

// Проверка, является ли окружение development
export function isDevelopment(): boolean {
  return config.NODE_ENV === 'development';
}

// Проверка, является ли окружение production
export function isProduction(): boolean {
  return config.NODE_ENV === 'production';
}

// Проверка, является ли окружение test
export function isTest(): boolean {
  return config.NODE_ENV === 'test';
}

// Проверка, включено ли логирование уровня debug
export function isDebug(): boolean {
  return config.LOG_LEVEL === 'debug';
}

// Получение URL базы данных
export function getDatabaseUrl(): string {
  return config.DATABASE_URL;
}

// Получение URL для фронтенда
export function getFrontendUrl(): string {
  return config.FRONTEND_URL;
}

// Получение настроек S3
export function getS3Config() {
  return {
    endpoint: config.S3_ENDPOINT,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    bucketName: config.S3_BUCKET_NAME,
    region: config.S3_REGION,
  };
}

// Получение настроек SMTP
export function getSmtpConfig() {
  return {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
    from: config.SMTP_FROM,
  };
}
```

## Установка окружения

### Для разработки

1. Копирование примера конфигурации:
   ```bash
   cp .env.example .env.development
   ```

2. Редактирование файла с реальными значениями:
   ```bash
   nano .env.development
   ```

3. Запуск приложения:
   ```bash
   # Установка переменной окружения
   export NODE_ENV=development
   
   # Запуск приложения
   pnpm run dev
   ```

### Для продакшена

1. Установка переменных окружения на сервере:
   ```bash
   export NODE_ENV=production
   export DATABASE_URL="postgresql://..."
   export JWT_SECRET="..."
   # и так далее для всех необходимых переменных
   ```

2. Или создание файла `.env.production` на сервере:
   ```bash
   nano .env.production
   ```

3. Запуск приложения:
   ```bash
   pnpm run build
   pnpm start
   ```

### Для тестирования

1. Копирование примера конфигурации:
   ```bash
   cp .env.example .env.test
   ```

2. Редактирование файла с тестовыми значениями:
   ```bash
   nano .env.test
   ```

3. Запуск тестов:
   ```bash
   export NODE_ENV=test
   pnpm run test
   ```

## Безопасность

### Хранение секретов

1. Никогда не коммитьте файлы `.env` в репозиторий
2. Используйте файл `.env.example` как шаблон
3. Используйте надежные пароли и секреты
4. Регулярно обновляйте секреты

### Управление доступом

1. Используйте разные секреты для разных сред
2. Ограничьте доступ к production переменным
3. Используйте систему управления секретами в production

## Docker и окружения

При использовании Docker переменные окружения могут передаваться через compose файл:

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  app:
    build: .
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
      # и так далее
    env_file:
      - .env.production
```

## Рекомендации

1. Всегда используйте файл `.env.example` как шаблон для новых установок
2. Валидируйте все переменные окружения при запуске приложения
3. Используйте разные базы данных для разных сред
4. Регулярно обновляйте секреты в production
5. Не храните чувствительные данные в системе контроля версий
6. Используйте надежные пароли и длинные секретные ключи
7. Проверяйте, что все обязательные переменные заданы
8. Используйте разные настройки лимитов для разных сред
9. Используйте моки для внешних сервисов в тестовой среде
10. Документируйте назначение каждой переменной окружения