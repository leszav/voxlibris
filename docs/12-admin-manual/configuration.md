# Конфигурация

## Обзор

В этом разделе описана конфигурация приложения VoxLibris для различных сред (разработка, тестирование, продакшен). Правильная настройка параметров окружения обеспечивает стабильную работу приложения и его безопасность.

## Структура конфигурации

### Переменные окружения

Конфигурация приложения основывается на переменных окружения, которые определяются в файле `.env`. Ниже приведены основные переменные:

#### Серверная конфигурация
- `PORT` - Порт, на котором запускается сервер (по умолчанию: 5000)
- `NODE_ENV` - Режим работы приложения (development, production, test)

#### Конфигурация базы данных
- `DATABASE_URL` - Строка подключения к PostgreSQL
- `DATABASE_SSL` - Использовать SSL при подключении к базе данных (true/false)

#### Конфигурация JWT
- `JWT_SECRET` - Секретный ключ для подписи JWT токенов (минимум 32 символа)
- `JWT_REFRESH_SECRET` - Секретный ключ для refresh токенов (минимум 32 символа)

#### Конфигурация файлового хранилища (S3/MinIO)
- `S3_ENDPOINT` - URL-адрес S3-совместимого хранилища
- `S3_ACCESS_KEY_ID` - ID ключа доступа
- `S3_SECRET_ACCESS_KEY` - Секретный ключ доступа
- `S3_BUCKET_NAME` - Имя бакета для хранения
- `S3_REGION` - Регион хранения

#### Конфигурация электронной почты
- `SMTP_HOST` - Хост SMTP-сервера
- `SMTP_PORT` - Порт SMTP-сервера
- `SMTP_USER` - Имя пользователя SMTP
- `SMTP_PASS` - Пароль SMTP
- `SMTP_FROM` - Адрес отправителя

#### Прочие конфигурации
- `FRONTEND_URL` - URL-адрес клиентского приложения (для CORS и перенаправлений)
- `AUDIO_BROADCAST_PORT` - Порт для вещания аудио (по умолчанию: 8000)
- `RATE_LIMIT_WINDOW_MS` - Временное окно для ограничения запросов (в миллисекундах)
- `RATE_LIMIT_MAX_REQUESTS` - Максимальное количество запросов в течение окна
- `LOG_LEVEL` - Уровень логирования (error, warn, info, debug)

## Примеры конфигураций

### Конфигурация для разработки

Файл `.env.development`:

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

### Конфигурация для продакшена

Файл `.env.production`:

```
# Server Configuration
PORT=5000
NODE_ENV=production

# Database Configuration
DATABASE_URL="postgresql://prod_user:secure_password@db-host:5432/voxlibris_prod"

# JWT Configuration
JWT_SECRET="long_secure_production_secret_here_with_at_least_32_characters"
JWT_REFRESH_SECRET="another_long_secure_production_secret_here"

# File Storage (using AWS S3)
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

## Валидация конфигурации

При запуске приложения происходит автоматическая валидация переменных окружения с использованием Zod:

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
```

## Управление конфигурацией

### Центральное управление

Все конфигурации приложения централизованы в файле `server/config/config.ts`:

```typescript
// server/config/config.ts
import { z } from 'zod';

// Тип для конфигурации
export type Config = z.infer<typeof envSchema>;

// Глобальная переменная конфигурации
export const config = loadConfig();
```

### Доступ к конфигурации

Конфигурация доступна из любого места в приложении:

```typescript
import { config } from '../config/config';

// Использование конфигурации
const dbUrl = config.DATABASE_URL;
const port = config.PORT;
```

## Безопасность конфигурации

### Хранение секретов

1. **Не храните чувствительные данные в системе контроля версий**
2. **Используйте надежные пароли и длинные секретные ключи**
3. **Регулярно обновляйте секреты в продакшене**
4. **Ограничьте доступ к файлам конфигурации**

### Права доступа к файлам

Убедитесь, что файлы конфигурации имеют правильные права доступа:

```bash
# Установка прав доступа к файлу конфигурации
chmod 600 .env.production

# Только владелец может читать и писать в файл
ls -la .env.production
```

## Мониторинг конфигурации

### Проверка конфигурации в runtime

Приложение включает проверку конфигурации при запуске:

```typescript
// server/index.ts
import { config } from './config/config';

try {
  // Проверка, что все необходимые переменные заданы
  console.log('Application configured successfully');
  console.log(`Running on port ${config.PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
} catch (error) {
  console.error('Configuration error:', error.message);
  process.exit(1);
}
```

## Docker и конфигурация

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
    env_file:
      - .env.production
```

## Изменение конфигурации в runtime

Для изменения конфигурации в runtime рекомендуется:

1. Обновить файл `.env` на сервере
2. Перезапустить приложение
3. Проверить логи на наличие ошибок

```bash
# Перезапуск приложения с PM2
pm2 restart voxlibris-app

# Или перезапуск Docker-контейнера
docker-compose restart app
```

## Рекомендации

1. **Используйте разные файлы конфигурации для разных сред**
2. **Валидируйте все переменные окружения при запуске приложения**
3. **Используйте разные базы данных для разных сред**
4. **Регулярно обновляйте секреты в продакшене**
5. **Не храните чувствительные данные в системе контроля версий**
6. **Используйте надежные пароли и длинные секретные ключи**
7. **Проверяйте, что все обязательные переменные заданы**
8. **Используйте разные настройки лимитов для разных сред**
9. **Используйте систему управления секретами в продакшене**
10. **Документируйте назначение каждой переменной окружения**