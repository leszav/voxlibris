# Переменные окружения

## Обзор

В проекте VoxLibris используются переменные окружения для конфигурации различных аспектов приложения, включая базу данных, аутентификацию, файловое хранилище и уведомления. Все переменные окружения определяются в файле `.env`.

## Основной файл конфигурации

Файл `.env.example` содержит все необходимые переменные с примерами значений:

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

## Подробное описание переменных

### Серверная конфигурация

- **PORT**: Порт, на котором будет запущен сервер (по умолчанию 5000)
- **NODE_ENV**: Режим запуска приложения (development, production, test)

### Конфигурация базы данных

- **DATABASE_URL**: Строка подключения к PostgreSQL, включает имя пользователя, пароль, хост и имя базы данных

### Конфигурация JWT

- **JWT_SECRET**: Секретный ключ для подписи JWT токенов аутентификации
- **JWT_REFRESH_SECRET**: Секретный ключ для подписи refresh токенов

### Конфигурация файлового хранилища

- **S3_ENDPOINT**: URL-адрес S3-совместимого сервиса (например, MinIO)
- **S3_ACCESS_KEY_ID**: Идентификатор ключа доступа к S3
- **S3_SECRET_ACCESS_KEY**: Секретный ключ доступа к S3
- **S3_BUCKET_NAME**: Имя бакета для хранения файлов
- **S3_REGION**: Регион S3-совместимого сервиса

### Конфигурация электронной почты

- **SMTP_HOST**: Хост SMTP-сервера
- **SMTP_PORT**: Порт SMTP-сервера
- **SMTP_USER**: Имя пользователя для аутентификации SMTP
- **SMTP_PASS**: Пароль для аутентификации SMTP
- **SMTP_FROM**: Адрес отправителя для уведомлений

### URL-адреса и адреса

- **FRONTEND_URL**: URL-адрес фронтенд-приложения, используется для CORS и перенаправлений

### Аудио вещание

- **AUDIO_BROADCAST_PORT**: Порт для аудио вещания во время сессий чтения

### Ограничение частоты запросов

- **RATE_LIMIT_WINDOW_MS**: Временной интервал в миллисекундах для ограничения запросов (по умолчанию 15 минут)
- **RATE_LIMIT_MAX_REQUESTS**: Максимальное количество запросов за временной интервал

### Логирование

- **LOG_LEVEL**: Уровень логирования (debug, info, warn, error)

## Создание файла .env

Для создания файла конфигурации выполните:

```bash
cp .env.example .env
```

Затем отредактируйте файл `.env`, указав актуальные значения для вашей среды:

```bash
# Редактирование файла .env
nano .env
```

## Использование в коде

Для доступа к переменным окружения в коде используйте:

```typescript
// В бэкенд-приложении
const port = parseInt(process.env.PORT || '5000');
const dbUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

// Проверка обязательных переменных
if (!jwtSecret) {
  throw new Error('JWT_SECRET is required');
}
```

## Проверка переменных

При запуске приложения проверяется наличие обязательных переменных окружения. Если какая-либо переменная отсутствует, приложение завершит работу с ошибкой.

## Безопасность

1. **Файл .env не должен быть добавлен в систему контроля версий**
2. Используйте надежные пароли и секретные ключи
3. Для production окружения используйте безопасные методы хранения секретов
4. Регулярно меняйте секретные ключи

## Переменные для разных сред

### Development

Для разработки используйте локальные сервисы:

```
DATABASE_URL="postgresql://dev_user:dev_password@localhost:5432/voxlibris_dev"
S3_ENDPOINT=http://localhost:9000
NODE_ENV=development
LOG_LEVEL=debug
```

### Production

Для production окружения используйте безопасные значения:

```
DATABASE_URL="postgresql://prod_user:secure_password@db-host:5432/voxlibris_prod"
S3_ENDPOINT=https://your-s3-provider.com
NODE_ENV=production
LOG_LEVEL=info
```

### Test

Для тестирования используйте отдельную базу данных:

```
DATABASE_URL="postgresql://test_user:test_password@localhost:5432/voxlibris_test"
NODE_ENV=test
LOG_LEVEL=warn
```

## Рекомендации

1. Всегда используйте файл `.env.example` как шаблон для новых установок
2. Обновляйте `.env.example` при добавлении новых переменных
3. Не храните чувствительные данные в системе контроля версий
4. Используйте разные значения для разных сред (dev, staging, prod)
5. Регулярно пересматривайте и обновляйте переменные окружения для безопасности