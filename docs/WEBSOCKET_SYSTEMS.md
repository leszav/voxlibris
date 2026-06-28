# WebSocket системы VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-06-28  
**Версия:** 1.0

## Содержание

1. [Обзор](#обзор)
2. [Socket.IO сервер](#socketio-сервер)
3. [Чтение книг (Reader WebSocket)](#чтение-книг-reader-websocket)
4. [Клубный чат (Chat WebSocket)](#клубный-чат-chat-websocket)
5. [Прямые сообщения (DM WebSocket)](#прямые-сообщения-dm-websocket)
6. [Сессии чтения (Reading Sessions)](#сессии-чтения-reading-sessions)
7. [Присутствие (Presence)](#присутствие-presence)
8. [Аутентификация](#аутентификация)
9. [События](#события)

## Обзор

VoxLibris использует несколько WebSocket систем для real-time функциональности:

| Система | Технология | Назначение |
|---------|------------|------------|
| Главный Socket.IO | Socket.IO | Feed, уведомления, DM |
| Reader WebSocket | WebSocket (native) | Чтение книг, прогресс |
| Club Chat | WebSocket (native) | Чат в клубах |
| Reading Sessions | Socket.IO namespace | Сессии чтения вслух |
| Presence | Socket.IO | Онлайн-статус |

## Socket.IO сервер

### Конфигурация

```typescript
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});
```

### Аутентификация

Опциональная аутентификация через JWT:
- Проверка токена из `auth.token`, `Authorization` header или cookies
- Сохранение `userId` в `socket.data`
- Анонимные соединения разрешены

### Персональные комнаты

```typescript
// Клиент вызывает после подключения
socket.emit('join_user_room', userId);

// Сервер присоединяет к комнате
socket.join(`user:${userId}`);
```

Используется для отправки персональных событий (feed, уведомления).

## Чтение книг (Reader WebSocket)

### Подключение

```
wss://{host}/reader?token={jwt_token}
```

### События клиента → сервер

| Событие | Данные | Описание |
|---------|--------|----------|
| `join_book` | `{ bookId: string }` | Присоединиться к книге |
| `leave_book` | `{ bookId: string }` | Покинуть книгу |
| `progress_update` | `{ bookId, position, percentage }` | Обновить прогресс |
| `bookmark_add` | `{ bookId, position, note? }` | Д