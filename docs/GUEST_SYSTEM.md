# Система гостевого доступа VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-06-28  
**Версия:** 1.0

## Содержание

1. [Обзор](#обзор)
2. [Архитектура](#архитектура)
3. [API Endpoints](#api-endpoints)
4. [Аутентификация гостя](#аутентификация-гостя)
5. [Ограничения](#ограничения)
6. [Rate Limiting](#rate-limiting)
7. [Feature Flags](#feature-flags)
8. [Безопасность](#безопасность)

## Обзор

Гостевая система позволяет пользователям использовать платформу без полной регистрации. Гость получает временный аккаунт с ограниченными правами.

### Возможности гостя

- [x] Создание анонимного аккаунта
- [x] Восстановление доступа по коду
- [x] Загрузка книг (ограниченное количество)
- [x] Чтение книг
- [x] Отслеживание прогресса
- [x] Базовая аналитика

### Ограничения гостя

- [ ] Нет доступа к клубам
- [ ] Нет социальных функций
- [ ] Нет синхронизации между устройствами
- [ ] Ограниченное количество загрузок
- [ ] Данные хранятся локально

## Архитектура

### Flow создания гостя

```
1. Пользователь открывает приложение
2. Выбирает "Продолжить как гость"
3. Сервер создаёт guest аккаунт
4. Возвращает guestId и restoreCode
5. Клиент сохраняет в localStorage
```

### Flow восстановления

```
1. Пользователь вводит restoreCode
2. Сервер ищет гостя по коду
3. Возвращает guestId и токены
4. Клиент восстанавливает сессию
```

## API Endpoints

### Создание гостя

```http
POST /api/v1/guest/init
Content-Type: application/json

{
  "deviceId": "string",      // Опционально
  "userAgent": "string"      // Опционально
}
```

**Response:**
```json
{
  "guestId": "uuid",
  "restoreCode": "string",
  "accessToken": "jwt",
  "refreshToken": "string"
}
```

### Восстановление гостя

```http
POST /api/v1/guest/restore
Content-Type: application/json

{
  "restoreCode": "string"
}
```

**Response:**
```json
{
  "guestId": "uuid",
  "accessToken": "jwt",
  "refreshToken": "string"
}
```

### Загрузка книги

```http
POST /api/v1/guest/books/upload
Content-Type: multipart/form-data

file: File (epub/fb2, max 50MB)
```

**Response:**
```json
{
  "bookId": "uuid",
  "title": "string",
  "author": "string",
  "status": "uploaded"
}
```

### Получение библиотеки

```http
GET /api/v1/guest/books
Authorization: Bearer {guest_token}
```

**Response:**
```json
{
  "books": [
    {
      "id": "uuid",
      "title": "string",
      "author": "string",
      "progress": 0.5,
      "lastReadAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

### Обновление прогресса

```http
POST /api/v1/guest/books/{bookId}/progress
Authorization: Bearer {guest_token}
Content-Type: application/json

{
  "position": 1000,
  "percentage": 0.5
}
```

### Аналитика

```http
POST /api/v1/guest/analytics
Authorization: Bearer {guest_token}
Content-Type: application/json

{
  "event": "page_view",
  "data": {
    "page": "reader",
    "bookId": "uuid"
  }
}
```

## Аутентификация гостя

Гости используют ту же JWT-систему, что и обычные пользователи, но с дополнительным флагом `isGuest: true` в токене.

### Middleware

```typescript
// guest-auth.ts
// Проверяет guest token и применяет ограничения
```

## Ограничения

### Жёсткие лимиты

| Ресурс | Лимит | Период |
|--------|-------|--------|
| Создание аккаунтов | 10 | 15 минут |
| Восстановление | 5 | 5 минут |
| Загрузка книг | 3 | 30 минут |
| Аналитика событий | 100 | 1 час |

### Хранение

- Книги хранятся в S3/MinIO с префиксом `guest/`
- Данные гостя хранятся в отдельных таблицах
- Автоматическая очистка неактивных гостей (30 дней)

## Rate Limiting

Отдельные лимиты для гостевой системы:

```bash
# Guest init
RL_GUEST_INIT_WINDOW_MS=900000      # 15 минут
RL_GUEST_INIT_MAX=10

# Guest restore
RL_GUEST_RESTORE_WINDOW_MS=300000   # 5 минут
RL_GUEST_RESTORE_MAX=5

# Guest upload
RL_GUEST_UPLOAD_WINDOW_MS=1800000   # 30 минут
RL_GUEST_UPLOAD_MAX=3

# Guest analytics
RL_GUEST_ANALYTICS_WINDOW_MS=3600000 # 1 час
RL_GUEST_ANALYTICS_MAX=100
```

## Feature Flags

Гостевая система управляется через feature flags:

```sql
-- Проверка в БД
SELECT value FROM feature_flags WHERE key = 'guest_system_enabled';
```

### Флаги

| Флаг | Значение по умолчанию | Описание |
|------|----------------------|----------|
| `guest_system_enabled` | `true` | Включить гостевую систему |
| `guest_upload_enabled` | `true` | Разрешить загрузку книг |
| `guest_analytics_enabled` | `true` | Собирать аналитику |

## Безопасность

### Защита от злоупотреблений

1. **Rate limiting** — отдельные лимиты для гостей
2. **Device fingerprinting** — отслеживание устройств
3. **IP-based limits** — ограничение по IP
4. **File validation** — проверка загружаемых файлов

### Данные

- Гостевые данные изолированы от основных пользователей
- Нет доступа к социальным функциям
- Нет синхронизации между устройствами
- Автоматическое удаление неактивных аккаунтов

### Миграция в полный аккаунт

Гость может мигрировать в полный аккаунт:
1. Регистрация с email/password
2. Перенос книг и прогресса
3. Удаление гостевого аккаунта

## Таблицы базы данных

```sql
-- Гостевые аккаунты
guest_users (
  id uuid PRIMARY KEY,
  restore_code text UNIQUE NOT NULL,
  device_id text,
  created_at timestamp DEFAULT now(),
  last_active_at timestamp DEFAULT now(),
  is_active boolean DEFAULT true
);

-- Гостевые книги
guest_books (
  id uuid PRIMARY KEY,
  guest_id uuid REFERENCES guest_users(id),
  title text,
  author text,
  file_path text,
  progress decimal,
  created_at timestamp DEFAULT now()
);

-- Гостевая аналитика
guest_analytics (
  id uuid PRIMARY KEY,
  guest_id uuid REFERENCES guest_users(id),
  event_type text,
  event_data jsonb,
  created_at timestamp DEFAULT now()
);
```

## Интеграция с клиентом

### React Hook

```typescript
// hooks/use-guest.ts
export function useGuest() {
  const [guest, setGuest] = useState<Guest | null>(null);
  
  const initGuest = async () => {
    const response = await api.post('/v1/guest/init');
    localStorage.setItem('guest_restore_code', response.restoreCode);
    setGuest(response);
  };
  
  const restoreGuest = async (code: string) => {
    const response = await api.post('/v1/guest/restore', { restoreCode: code });
    setGuest(response);
  };
  
  return { guest, initGuest, restoreGuest };
}
```

## Мониторинг

### Метрики

- Количество активных гостей
- Количество загрузок
- Rate limit hits
- Ошибки восстановления

### Алерты

- Подозрительная активность (много созданий с одного IP)
- Превышение лимитов хранилища
- Ошибки восстановления > 5%