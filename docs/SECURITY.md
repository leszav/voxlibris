# Безопасность VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-06-28  
**Версия:** 1.0

## Содержание

1. [Обзор безопасности](#обзор-безопасности)
2. [Аутентификация и авторизация](#аутентификация-и-авторизация)
3. [Rate Limiting](#rate-limiting)
4. [Защита данных](#защита-данных)
5. [Безопасность файлов](#безопасность-файлов)
6. [CORS и CSP](#cors-и-csp)
7. [Логирование и мониторинг](#логирование-и-мониторинг)
8. [Проверка окружения](#проверка-окружения)

## Обзор безопасности

VoxLibris реализует многоуровневую систему безопасности:

- **JWT-аутентификация** с refresh tokens
- **Rate limiting** на уровне IP и пользователя
- **Helmet** для security headers
- **CORS** с ограничением origins
- **Content Security Policy**
- **Валидация загружаемых файлов**
- **Маскирование чувствительных данных в логах**

## Аутентификация и авторизация

### JWT Tokens

```typescript
// Access token — короткоживущий (15 минут)
// Refresh token — долгоживущий (7 дней), хранится в httpOnly cookie
```

### Middleware

| Middleware | Назначение | Применение |
|------------|------------|------------|
| `jwtAuth` | Проверка access token | Защищённые endpoints |
| `optionalJwtAuth` | Опциональная проверка | Публичные endpoints с расширенными возможностями для авторизованных |
| `requireActiveUser` | Проверка подтверждённого email | Критичные операции |

### Guest System

Гостевой доступ с ограниченными правами:
- Анонимное создание аккаунта
- Восстановление по коду
- Ограниченное количество загрузок
- Отдельные rate limits

## Rate Limiting

### Уровни защиты

| Limiter | Window | Max | Scope | Ключ |
|---------|--------|-----|-------|------|
| `authLimiter` | 15 мин | 5 | Auth endpoints | `auth:{identifier}:{ip}` |
| `resendConfirmationLimiter` | 1 час | 3 | Повторная отправка подтверждения | `resend:{userId}:{ip}` |
| `guestInitLimiter` | 15 мин | 10 | Создание гостевых аккаунтов | `guest-init:{ip}` |
| `guestRestoreLimiter` | 5 мин | 5 | Восстановление гостя | `guest-restore:{ip}` |
| `guestUploadLimiter` | 30 мин | 3 | Загрузка гостем | `guest-upload:{ip}` |
| `guestAnalyticsLimiter` | 1 час | 100 | Аналитика гостя | `guest-analytics:{ip}` |
| `anonymousBurstLimiter` | 5 сек | 10 | Анонимный burst | `anon-burst:{ip}` |
| `anonymousReadLimiter` | 1 мин | 120 | Анонимное чтение | `anon-read:{ip}` |
| `anonymousWriteLimiter` | 15 мин | 120 | Анонимные изменения | `anon-write:{ip}` |
| `authenticatedReadLimiter` | 15 мин | 1200 | Авторизованное чтение | `user:{userId}` или `ip:{ip}` |
| `authenticatedWriteLimiter` | 15 мин | 300 | Авторизованные изменения | `user:{userId}` или `ip:{ip}` |
| `expensiveLimiter` | 15 мин | 30 | Тяжёлые операции | `user:{userId}` или `ip:{ip}` |

### Redis Store

Rate limiting использует Redis в production для распределённого хранения счётчиков. Fallback — in-memory store.

```bash
# Переменные окружения
RATE_LIMIT_REDIS_URL=redis://localhost:6379
RATE_LIMIT_REDIS_ENABLED=true
RATE_LIMIT_REDIS_PREFIX=rl:voxlibris
```

### Настройка лимитов

Все лимиты конфигурируются через переменные окружения:

```bash
RL_AUTH_DELAY_AFTER=1000
RL_AUTH_DELAY_WINDOW_MS=900000
RL_ANON_BURST_WINDOW_MS=5000
RL_ANON_BURST_MAX=10
RL_ANON_READ_WINDOW_MS=60000
RL_ANON_READ_MAX=120
RL_ANON_WRITE_WINDOW_MS=900000
RL_ANON_WRITE_MAX=120
RL_AUTH_READ_WINDOW_MS=900000
RL_AUTH_READ_MAX=1200
RL_AUTH_WRITE_WINDOW_MS=900000
RL_AUTH_WRITE_MAX=300
RL_EXPENSIVE_WINDOW_MS=900000
RL_EXPENSIVE_MAX=30
RL_GUEST_INIT_WINDOW_MS=900000
RL_GUEST_INIT_MAX=10
RL_GUEST_RESTORE_WINDOW_MS=300000
RL_GUEST_RESTORE_MAX=5
RL_GUEST_UPLOAD_WINDOW_MS=1800000
RL_GUEST_UPLOAD_MAX=3
RL_GUEST_ANALYTICS_WINDOW_MS=3600000
RL_GUEST_ANALYTICS_MAX=100
RL_RESEND_CONFIRMATION_WINDOW_MS=3600000
RL_RESEND_CONFIRMATION_MAX=3
```

## Защита данных

### Маскирование в логах

Чувствительные данные автоматически маскируются:
- Пароли, токены, секреты → `***`
- Изображения, аватары → `[{size} bytes]`
- Большие строки → `{first_100_chars}... [{total} chars total]`

### Шифрование

- **Пароли**: bcrypt с salt rounds 10
- **Токены**: JWT с HS256
- **Refresh tokens**: хранятся хешированными в БД
- **Reset tokens**: временные, одноразовые

## Безопасность файлов

### Валидация загрузки

```typescript
// Разрешённые типы
const allowedMimeTypes = ['application/epub+zip', 'application/x-fictionbook+xml'];
const allowedExtensions = ['.epub', '.fb2'];
const maxSize = 50 * 1024 * 1024; // 50MB
```

### Валидация путей

Защита от Path Traversal:
- Проверка на `..`, `\`, `\0`
- Ограничение длины пути (255 символов)
- Разрешённые паттерны через regex

### Разрешённые паттерны путей

```
covers/{uuid}.{jpg|jpeg|png|webp}
covers/{club|personal}/{uuid}/{uuid}-cover.{jpg|jpeg|png|webp}
books/{uuid}/content.{epub|fb2|html}
avatars/{uuid}.{jpg|jpeg|png|webp}
profiles/{uuid}/{name}-{uuid}.{jpg|jpeg|png|webp}
gamification/{reward-assets|achievements}/{name}-{uuid}.{jpg|jpeg|png|webp}
clubs/{uuid}/{name}-{uuid}.{jpg|jpeg|png|webp}
```

## CORS и CSP

### CORS Configuration

```typescript
{
  origin: allowedOrigins,  // Из ALLOWED_ORIGINS
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  exposedHeaders: ["X-Total-Count"]
}
```

### Content Security Policy

```
default-src: 'self'
style-src: 'self' 'unsafe-inline'
font-src: 'self'
img-src: 'self' data: https: blob:
script-src: 'self' https://mc.yandex.ru https://mc.yandex.com
connect-src: 'self' wss: https:
media-src: 'self' blob: https://radio.voxlibris.ru
frame-src: 'none'
object-src: 'none'
base-uri: 'self'
form-action: 'self'
```

### HSTS

```
max-age: 31536000
includeSubDomains: true
preload: true
```

## Логирование и мониторинг

### Структурированные логи

Используется Pino для структурированного логирования:
- Все API запросы логируются с duration и статусом
- Чувствительные данные маскируются
- Ошибки логируются со stack trace

### Health Check

```bash
GET /api/health
```

Возвращает статус сервера и версию.

## Проверка окружения

При старте сервера выполняется валидация обязательных переменных окружения:

```typescript
// Обязательные переменные
JWT_SECRET
DATABASE_URL

// Опциональные с дефолтами
PORT=5000
NODE_ENV=development
JSON_BODY_LIMIT=15mb
URLENCODED_BODY_LIMIT=1mb
```

### Trust Proxy

```typescript
app.set('trust proxy', 1); // Trust only first hop
```

Предотвращает spoofing IP-адресов от пользователей.

## Security Checklist

- [ ] JWT_SECRET минимум 32 символа в production
- [ ] HTTPS в production
- [ ] Redis защищён паролем
- [ ] Rate limiting включён
- [ ] CSP настроен
- [ ] HSTS включён
- [ ] File upload валидируется
- [ ] Логи не содержат чувствительных данных
- [ ] CORS origins ограничены
- [ ] Trust proxy настроен корректно