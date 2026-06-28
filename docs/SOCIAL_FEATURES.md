# Социальные функции VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-06-28  
**Версия:** 1.0

## Содержание

1. [Обзор](#обзор)
2. [Социальный граф](#социальный-граф)
3. [Лента активности](#лента-активности)
4. [Прямые сообщения](#прямые-сообщения)
5. [Присутствие](#присутствие)
6. [Рекомендации](#рекомендации)
7. [Push-уведомления](#push-уведомления)
8. [Эмоциональная карта](#эмоциональная-карта)
9. [API Endpoints](#api-endpoints)

## Обзор

VoxLibris предоставляет полный набор социальных функций для взаимодействия пользователей:

- **Социальный граф** — подписки, подписчики, друзья
- **Лента активности** — события пользователей и клубов
- **Прямые сообщения** — real-time чат между пользователями
- **Присутствие** — онлайн-статус в клубах
- **Рекомендации** — персонализированные рекомендации книг и клубов
- **Push-уведомления** — браузерные push-уведомления
- **Эмоциональная карта** — визуализация эмоций при чтении

## Социальный граф

### Модель подписок

```
Пользователь A ──follows──> Пользователь B
     │
     └──follows──> Клуб C
```

### Сущности

| Сущность | Описание |
|----------|----------|
| `Follow` | Подписка пользователя на пользователя |
| `ClubFollow` | Подписка пользователя на клуб |
| `FriendRequest` | Запрос в друзья |
| `Friendship` | Взаимная дружба |

### API

```http
POST /api/social/follow
Authorization: Bearer {token}
Content-Type: application/json

{
  "targetUserId": "uuid"
}
```

```http
DELETE /api/social/follow/{userId}
Authorization: Bearer {token}
```

```http
GET /api/social/followers?userId={uuid}&limit=20&offset=0
```

```http
GET /api/social/following?userId={uuid}&limit=20&offset=0
```

### Взаимные подписки

При взаимной подписке создаётся `Friendship`:
- Обе стороны видят друг друга в списке друзей
- Доступны приватные сообщения
- Показывается статус "друг" в профиле

## Лента активности

### Типы событий

| Тип | Описание | Данные |
|-----|----------|--------|
| `book_completed` | Завершена книга | bookId, title, rating |
| `club_joined` | Присоединение к клубу | clubId, name |
| `session_attended` | Посещение сессии | sessionId, clubId |
| `achievement_unlocked` | Новое достижение | achievementId, name |
| `review_posted` | Опубликован отзыв | bookId, rating, text |
| `reading_started` | Начато чтение | bookId, title |

### Архитектура

```
Пользователь выполняет действие
        ↓
Activity Service создаёт событие
        ↓
Событие сохраняется в БД
        ↓
Рассылка подписчикам через WebSocket
        ↓
Обновление ленты в реальном времени
```

### API

```http
GET /api/feed?limit=20&offset=0
Authorization: Bearer {token}
```

**Response:**
```json
{
  "events": [
    {
      "id": "uuid",
      "type": "book_completed",
      "actor": {
        "userId": "uuid",
        "username": "reader1",
        "avatar": "https://..."
      },
      "data": {
        "bookId": "uuid",
        "title": "Война и мир",
        "rating": 5
      },
      "createdAt": "2026-01-15T10:30:00Z"
    }
  ],
  "hasMore": true
}
```

```http
GET /api/feed/user/{userId}?limit=20&offset=0
```

Публичная лента пользователя (доступна без авторизации).

## Прямые сообщения

### Архитектура

Использует Socket.IO для real-time сообщений:
- Соединение через главный Socket.IO сервер
- Аутентификация через JWT
- Сохранение истории в PostgreSQL

### События WebSocket

| Событие | Направление | Данные |
|---------|-------------|--------|
| `dm:message` | Клиент → Сервер | `{ to: userId, text: string }` |
| `dm:message` | Сервер → Клиент | `{ from: userId, text: string, timestamp }` |
| `dm:typing` | Клиент → Сервер | `{ to: userId }` |
| `dm:typing` | Сервер → Клиент | `{ from: userId }` |
| `dm:read` | Клиент → Сервер | `{ messageId: uuid }` |

### API

```http
GET /api/dm/conversations
Authorization: Bearer {token}
```

**Response:**
```json
{
  "conversations": [
    {
      "userId": "uuid",
      "username": "reader2",
      "avatar": "https://...",
      "lastMessage": {
        "text": "Привет!",
        "timestamp": "2026-01-15T10:30:00Z",
        "isRead": false
      },
      "unreadCount": 3
    }
  ]
}
```

```http
GET /api/dm/messages/{userId}?limit=50&before={messageId}
Authorization: Bearer {token}
```

```http
POST /api/dm/messages/{userId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "text": "Привет! Как дела?"
}
```

## Присутствие

### Онлайн-статус

Отслеживание активности пользователей в клубах:

```http
GET /api/presence/club/{clubId}
```

**Response:**
```json
{
  "online": [
    {
      "userId": "uuid",
      "username": "reader1",
      "avatar": "https://...",
      "status": "reading",  // reading, listening, idle
      "since": "2026-01-15T10:30:00Z"
    }
  ],
  "count": 5
}
```

### Статусы

| Статус | Описание |
|--------|----------|
| `online` | Пользователь активен |
| `reading` | Читает книгу |
| `listening` | Слушает эфир |
| `idle` | Неактивен > 5 минут |
| `offline` | Не в сети |

### WebSocket события

```typescript
// При входе в клуб
socket.emit('presence:join', { clubId: 'uuid' });

// При выходе
socket.emit('presence:leave', { clubId: 'uuid' });

// Обновление статуса
socket.emit('presence:update', { status: 'reading' });
```

## Рекомендации

### Алгоритм

Рекомендации основаны на:
- Истории чтения пользователя
- Предпочтениях жанров
- Активности друзей
- Популярности в клубах
- Коллаборативной фильтрации

### API

```http
GET /api/recommendations/books?limit=10
Authorization: Bearer {token}
```

**Response:**
```json
{
  "books": [
    {
      "id": "uuid",
      "title": "1984",
      "author": "Джордж Оруэлл",
      "reason": "Похоже на ваши любимые книги",
      "score": 0.95
    }
  ]
}
```

```http
GET /api/recommendations/clubs?limit=10
Authorization: Bearer {token}
```

```http
GET /api/recommendations/users?limit=10
Authorization: Bearer {token}
```

## Push-уведомления

### Браузерные Push

Поддержка Web Push API:
- Подписка через Service Worker
- Хранение подписок в БД
- Отправка через web-push библиотеку

### API

```http
POST /api/push/subscribe
Authorization: Bearer {token}
Content-Type: application/json

{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

```http
DELETE /api/push/subscribe
Authorization: Bearer {token}
```

```http
GET /api/push/settings
Authorization: Bearer {token}
```

**Response:**
```json
{
  "enabled": true,
  "types": {
    "newMessage": true,
    "clubActivity": true,
    "sessionReminder": true,
    "achievement": true
  }
}
```

```http
PUT /api/push/settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "types": {
    "newMessage": false
  }
}
```

## Эмоциональная карта

### Концепция

Визуализация эмоционального состояния пользователя при чтении:
- Отметка эмоций на временной шкале книги
- Анализ паттернов чтения
- Рекомендации на основе эмоционального профиля

### API

```http
POST /api/emotional-map/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "bookId": "uuid",
  "position": 1000,
  "emotion": "joy",  // joy, sadness, fear, anger, surprise, disgust, neutral
  "intensity": 0.8,  // 0-1
  "note": "Очень трогательный момент"
}
```

```http
GET /api/emotional-map/books/{bookId}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "bookId": "uuid",
  "emotions": [
    {
      "position": 1000,
      "emotion": "joy",
      "intensity": 0.8,
      "timestamp": "2026-01-15T10:30:00Z"
    }
  ],
  "profile": {
    "dominant": "joy",
    "distribution": {
      "joy": 0.5,
      "sadness": 0.2,
      "fear": 0.1,
      "anger": 0.05,
      "surprise": 0.1,
      "disgust": 0.02,
      "neutral": 0.03
    }
  }
}
```

```http
GET /api/emotional-map/profile
Authorization: Bearer {token}
```

## API Endpoints

### Социальный граф

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/social/follow` | Подписаться |
| DELETE | `/api/social/follow/{userId}` | Отписаться |
| GET | `/api/social/followers` | Подписчики |
| GET | `/api/social/following` | Подписки |
| GET | `/api/social/friends` | Друзья |
| POST | `/api/social/friends/request` | Запрос в друзья |
| POST | `/api/social/friends/accept` | Принять запрос |
| DELETE | `/api/social/friends/{userId}` | Удалить друга |

### Лента

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/feed` | Лента активности |
| GET | `/api/feed/user/{userId}` | Лента пользователя |
| GET | `/api/feed/club/{clubId}` | Лента клуба |

### Сообщения

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/dm/conversations` | Список диалогов |
| GET | `/api/dm/messages/{userId}` | История сообщений |
| POST | `/api/dm/messages/{userId}` | Отправить сообщение |
| PUT | `/api/dm/messages/{messageId}/read` | Прочитать сообщение |
| DELETE | `/api/dm/messages/{messageId}` | Удалить сообщение |

### Присутствие

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/presence/club/{clubId}` | Онлайн в клубе |
| GET | `/api/presence/user/{userId}` | Статус пользователя |

### Рекомендации

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/recommendations/books` | Книги |
| GET | `/api/recommendations/clubs` | Клубы |
| GET | `/api/recommendations/users` | Пользователи |

### Push

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/push/subscribe` | Подписаться |
| DELETE | `/api/push/subscribe` | Отписаться |
| GET | `/api/push/settings` | Настройки |
| PUT | `/api/push/settings` | Обновить настройки |

### Эмоциональная карта

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/emotional-map/events` | Добавить эмоцию |
| GET | `/api/emotional-map/books/{bookId}` | Карта книги |
| GET | `/api/emotional-map/profile` | Профиль пользователя |

## Таблицы базы данных

```sql
-- Подписки
follows (
  id uuid PRIMARY KEY,
  follower_id uuid REFERENCES users(id),
  following_id uuid REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

-- Дружба
friendships (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  friend_id uuid REFERENCES users(id),
  status text DEFAULT 'pending',
  created_at timestamp DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- События ленты
activity_events (
  id uuid PRIMARY KEY,
  type text NOT NULL,
  actor_id uuid REFERENCES users(id),
  target_id uuid,
  target_type text,
  data jsonb,
  created_at timestamp DEFAULT now()
);

-- Подписки на ленту
activity_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  target_id uuid,
  target_type text,
  created_at timestamp DEFAULT now()
);

-- Сообщения
direct_messages (
  id uuid PRIMARY KEY,
  sender_id uuid REFERENCES users(id),
  recipient_id uuid REFERENCES users(id),
  text text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

-- Присутствие
presence (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  club_id uuid REFERENCES clubs(id),
  status text DEFAULT 'online',
  last_active timestamp DEFAULT now()
);

-- Push подписки
push_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp DEFAULT now()
);

-- Эмоциональные события
emotional_events (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  book_id uuid REFERENCES books(id),
  position integer,
  emotion text NOT NULL,
  intensity decimal,
  note text,
  created_at timestamp DEFAULT now()
);
```

## Мониторинг

### Метрики

- DAU/MAU социальных функций
- Сообщений в минуту
- Подписок в день
- Retention по социальным функциям
- Push delivery rate

### Алерты

- Рост ошибок WebSocket
- Задержки доставки сообщений
- Падение push delivery rate