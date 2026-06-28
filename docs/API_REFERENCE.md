# API Reference VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-06-28  
**Версия:** 1.0

## Содержание

1. [Базовый URL](#базовый-url)
2. [Аутентификация](#аутентификация)
3. [Формат ответов](#формат-ответов)
4. [Коды ошибок](#коды-ошибок)
5. [Rate Limiting](#rate-limiting)
6. [Endpoints](#endpoints)

## Базовый URL

```
Development: http://localhost:5000
Production: https://api.voxlibris.ru
```

## Аутентификация

### JWT Token

Все защищённые endpoints требуют Bearer token:

```http
Authorization: Bearer {access_token}
```

### Получение токена

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "reader1"
  }
}
```

### Обновление токена

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Формат ответов

### Успешный ответ

```json
{
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "perPage": 20
  }
}
```

### Ошибка

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Email is required"
      }
    ]
  }
}
```

## Коды ошибок

| Код | HTTP | Описание |
|-----|------|----------|
| `VALIDATION_ERROR` | 400 | Ошибка валидации |
| `UNAUTHORIZED` | 401 | Не авторизован |
| `FORBIDDEN` | 403 | Доступ запрещён |
| `NOT_FOUND` | 404 | Ресурс не найден |
| `RATE_LIMITED` | 429 | Превышен лимит |
| `INTERNAL_ERROR` | 500 | Внутренняя ошибка |

## Rate Limiting

Заголовки ответа:

```http
X-RateLimit-Limit: 1200
X-RateLimit-Remaining: 1199
X-RateLimit-Reset: 1640995200
```

## Endpoints

### Аутентификация

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| POST | `/api/auth/register` | Регистрация | Нет |
| POST | `/api/auth/login` | Вход | Нет |
| POST | `/api/auth/logout` | Выход | Да |
| POST | `/api/auth/refresh` | Обновить токен | Нет |
| POST | `/api/auth/forgot-password` | Забыли пароль | Нет |
| POST | `/api/auth/reset-password` | Сброс пароля | Нет |
| GET | `/api/auth/confirm-email` | Подтверждение email | Нет |
| POST | `/api/auth/resend-confirmation` | Повторная отправка | Да |

### Пользователи

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/api/users` | Поиск пользователей | Опц. |
| GET | `/api/users/{id}` | Профиль пользователя | Опц. |
| PUT | `/api/users/me` | Обновить профиль | Да |
| GET | `/api/users/me` | Мой профиль | Да |
| PUT | `/api/users/me/avatar` | Загрузить аватар | Да |

### Книги

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/api/books` | Список книг | Опц. |
| GET | `/api/books/{id}` | Детали книги | Опц. |
| POST | `/api/books` | Загрузить книгу | Да |
| DELETE | `/api/books/{id}` | Удалить книгу | Да |
| GET | `/api/books/{id}/content` | Получить контент | Да |
| POST | `/api/books/{id}/progress` | Обновить прогресс | Да |

### Клубы

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/api/clubs` | Список клубов | Опц. |
| GET | `/api/clubs/{id}` | Детали клуба | Опц. |
| POST | `/api/clubs` | Создать клуб | Да |
| PUT | `/api/clubs/{id}` | Обновить клуб | Да |
| DELETE | `/api/clubs/{id}` | Удалить клуб | Да |
| POST | `/api/clubs/{id}/join` | Присоединиться | Да |
| POST | `/api/clubs/{id}/leave` | Покинуть | Да |
| GET | `/api/clubs/{id}/members` | Участники | Опц. |

### Сессии чтения

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/api/reading-sessions` | Список сессий | Да |
| GET | `/api/reading-sessions/{id}` | Детали сессии | Да |
| POST | `/api/reading-sessions` | Создать сессию | Да |
| POST | `/api/reading-sessions/{id}/join` | Присоединиться | Да |
| POST | `/api/reading-sessions/{id}/leave` | Покинуть | Да |

### Социальные функции

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| POST | `/api/social/follow` | Подписаться | Да |
| DELETE | `/api/social/follow/{id}` | Отписаться | Да |
| GET | `/api/social/followers` | Подписчики | Опц. |
| GET | `/api/social/following` | Подписки | Опц. |
| GET | `/api/feed` | Лента активности | Опц. |
| GET | `/api/dm/conversations` | Диалоги | Да |
| GET | `/api/dm/messages/{id}` | Сообщения | Да |
| POST | `/api/dm/messages/{id}` | Отправить | Да |

### Геймификация

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/api/gamification/progress` | Прогресс | Да |
| GET | `/api/gamification/achievements` | Достижения | Да |
| GET | `/api/gamification/leaderboard` | Лидерборд | Опц. |

### Монетизация

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/api/commerce/tariffs` | Тарифы | Опц. |
| POST | `/api/commerce/subscriptions` | Подписаться | Да |
| GET | `/api/commerce/entitlements` | Права | Да |
| GET | `/api/commerce/payments` | История | Да |

### Studio

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| POST | `/api/studio/stream/start` | Начать эфир | Да |
| POST | `/api/studio/stream/stop` | Остановить | Да |
| GET | `/api/recordings` | Записи | Да |
| POST | `/api/recordings/{id}/publish` | Опубликовать | Да |

### Админ

| Метод | Путь | Описание | Auth |
|-------|------|----------|------|
| GET | `/api/v1/admin/users` | Пользователи | Admin |
| GET | `/api/v1/admin/clubs` | Клубы | Admin |
| GET | `/api/v1/admin/analytics` | Аналитика | Admin |
| GET | `/api/v1/admin/gamification/stats` | Статистика | Admin |
| PUT | `/api/v1/admin/feature-flags` | Feature flags | Admin |

## Пагинация

Параметры запроса:

```http
GET /api/books?limit=20&offset=0
```

Параметры ответа:

```json
{
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "perPage": 20,
    "hasMore": true
  }
}
```

## Фильтрация

```http
GET /api/books?genre=fiction&status=active&sort=popular
```

## Поиск

```http
GET /api/books?q=война+и+мир
GET /api/users?q=иван
GET /api/clubs?q=классика
```

## WebSocket

### Подключение

```javascript
const socket = io('wss://api.voxlibris.ru', {
  auth: { token: accessToken },
  transports: ['websocket']
});
```

### События

```javascript
// Присоединиться к комнате
socket.emit('join_user_room', userId);

// Лента
socket.on('feed:new_event', (event) => {
  console.log('New event:', event);
});

// Сообщения
socket.on('dm:message', (message) => {
  console.log('New message:', message);
});
```

## Примеры

### cURL

```bash
# Вход
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Получить книги
curl http://localhost:5000/api/books \
  -H "Authorization: Bearer {token}"

# Загрузить книгу
curl -X POST http://localhost:5000/api/books \
  -H "Authorization: Bearer {token}" \
  -F "file=@book.epub"
```

### JavaScript

```javascript
// API клиент
const api = {
  async login(email, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return response.json();
  },
  
  async getBooks(token) {
    const response = await fetch('/api/books', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.json();
  }
};
```

## Версионирование

API версионируется через URL:

```
/api/v1/...     # Текущая версия
/api/...        # Legacy (backward compatible)
```

## Deprecation

Устаревшие endpoints помечаются в документации:

```http
Deprecation: true
Sunset: Sat, 01 Jan 2027 00:00:00 GMT