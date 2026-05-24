# Reading Sessions API

API для управления сессиями чтения в VoxLibris Studio.

## Endpoints

### Создать сессию чтения

**POST** `/api/reading-sessions`

Тело запроса:
```json
{
  "clubId": "club-id",
  "bookId": "book-id",
  "chapter": 1
}
```

Ответ:
```json
{
  "success": true,
  "session": {
    "id": "session-id",
    "clubId": "club-id",
    "bookId": "book-id",
    "userId": "user-id",
    "chapter": 1,
    "status": "active",
    "position": "0",
    "listenerCount": 0,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Получить сессию

**GET** `/api/reading-sessions/:sessionId`

Ответ:
```json
{
  "success": true,
  "session": { ... }
}
```

### Получить сессии клуба

**GET** `/api/reading-sessions/club/:clubId`

Параметры запроса:
- `status` (опционально) — фильтрация по статусу (`active`, `paused`, `completed`, `cancelled`)

Ответ:
```json
{
  "success": true,
  "sessions": [ ... ]
}
```

### Получить сессии книги

**GET** `/api/reading-sessions/book/:bookId`

Ответ:
```json
{
  "success": true,
  "sessions": [ ... ]
}
```

### Получить активную сессию пользователя

**GET** `/api/reading-sessions/active/:userId`

Ответ:
```json
{
  "success": true,
  "session": { ... }
}
```

### Обновить статус сессии

**PUT** `/api/reading-sessions/:sessionId/status`

Тело запроса:
```json
{
  "status": "active"
}
```

Допустимые статусы:
- `active` — активная
- `paused` — на паузе
- `completed` — завершена
- `cancelled` — отменена

### Обновить позицию чтения

**PUT** `/api/reading-sessions/:sessionId/position`

Тело запроса:
```json
{
  "position": "123",
  "chapter": 2
}
```

### Обновить количество слушателей

**PUT** `/api/reading-sessions/:sessionId/listeners`

Тело запроса:
```json
{
  "count": 5
}
```

### Присоединиться к сессии

**POST** `/api/reading-sessions/:sessionId/join`

Ответ:
```json
{
  "success": true,
  "message": "Joined session successfully",
  "listenerCount": 5
}
```

### Покинуть сессию

**POST** `/api/reading-sessions/:sessionId/leave`

Ответ:
```json
{
  "success": true,
  "message": "Left session successfully",
  "listenerCount": 4
}
```

### Завершить сессию

**DELETE** `/api/reading-sessions/:sessionId`

Ответ:
```json
{
  "success": true,
  "message": "Session ended successfully"
}
```

## WebSocket Events

### Клиент → Сервер

#### Присоединиться к сессии
```javascript
socket.emit('reading-session:join', 'session-id');
```

#### Покинуть сессию
```javascript
socket.emit('reading-session:leave', 'session-id');
```

#### Обновить статус (только для создателя)
```javascript
socket.emit('reading-session:update-status', {
  sessionId: 'session-id',
  status: 'paused'
});
```

#### Обновить позицию (только для создателя)
```javascript
socket.emit('reading-session:update-position', {
  sessionId: 'session-id',
  position: '123',
  chapter: 2
});
```

#### Получить позицию
```javascript
socket.emit('reading-session:get-position', 'session-id');
```

#### Получить слушателей
```javascript
socket.emit('reading-session:get-listeners', 'session-id');
```

#### Отправить реакцию
```javascript
socket.emit('reading-session:reaction', {
  sessionId: 'session-id',
  emoji: '👍',
  type: 'positive'
});
```

#### Задать вопрос
```javascript
socket.emit('reading-session:question', {
  sessionId: 'session-id',
  question: 'Вопрос чтецу'
});
```

#### Ответить на вопрос (только для чтеца)
```javascript
socket.emit('reading-session:answer-question', {
  questionId: 'question-id',
  answer: 'Ответ на вопрос'
});
```

### Сервер → Клиент

#### Присоединился к сессии
```javascript
socket.on('reading-session:joined', (data) => {
  console.log('Joined session:', data.sessionId);
  console.log('Listener count:', data.listenerCount);
});
```

#### Покинул сессию
```javascript
socket.on('reading-session:left', (data) => {
  console.log('Left session:', data.sessionId);
});
```

#### Слушатель присоединился
```javascript
socket.on('reading-session:listener-joined', (data) => {
  console.log('Listener joined:', data.userId);
  console.log('Total listeners:', data.listenerCount);
});
```

#### Слушатель покинул
```javascript
socket.on('reading-session:listener-left', (data) => {
  console.log('Listener left:', data.userId);
  console.log('Total listeners:', data.listenerCount);
});
```

#### Статус обновлен
```javascript
socket.on('reading-session:status-updated', (data) => {
  console.log('Status updated:', data.status);
});
```

#### Позиция обновлена
```javascript
socket.on('reading-session:position-updated', (data) => {
  console.log('Position:', data.position);
  console.log('Chapter:', data.chapter);
});
```

#### Текущая позиция
```javascript
socket.on('reading-session:position', (data) => {
  console.log('Current position:', data.position);
});
```

#### Список слушателей
```javascript
socket.on('reading-session:listeners', (data) => {
  console.log('Listeners:', data.listeners);
  console.log('Count:', data.count);
});
```

#### Реакция получена
```javascript
socket.on('reading-session:reaction', (data) => {
  console.log('Reaction:', data.emoji);
  console.log('From:', data.userId);
});
```

#### Вопрос получен
```javascript
socket.on('reading-session:question', (data) => {
  console.log('Question:', data.question);
  console.log('From:', data.userId);
});
```

#### Вопрос отвечен
```javascript
socket.on('reading-session:question-answered', (data) => {
  console.log('Answer:', data.answer);
});
```

#### Ошибка
```javascript
socket.on('error', (error) => {
  console.error('Error:', error.message);
});
```

## Интеграция с WebRTC

Сессии чтения интегрированы с WebRTC через сервис `ReadingSessionWebRTCService`:

1. При создании сессии автоматически создается WebRTC комната
2. Чтец и слушатели могут присоединяться к комнате для аудио стриминга
3. Управление пирами происходит через WebRTC handler

### Пример использования

```typescript
import { readingSessionWebRTCService } from './services/reading-session-webrtc.js';

// Создать комнату для сессии
const roomId = await readingSessionWebRTCService.createRoomForSession('session-id');

// Присоединить чтеца к комнате
await readingSessionWebRTCService.joinReaderToRoom('session-id', 'peer-id', 'user-id', 'Reader Name');

// Присоединить слушателя к комнате
await readingSessionWebRTCService.joinListenerToRoom('session-id', 'peer-id', 'user-id', 'Listener Name');

// Получить количество слушателей
const count = await readingSessionWebRTCService.getListenerCount('session-id');

// Закрыть комнату
await readingSessionWebRTCService.closeRoomForSession('session-id');
```

## WebSocket Namespace

События сессий чтения доступны в отдельном namespace `/reading-sessions`.

### Подключение

```javascript
const socket = io('/reading-sessions', {
  auth: {
    token: 'jwt-token'
  }
});
```

### Аутентификация

Namespace требует JWT токен для аутентификации. Токен передается через `auth` при подключении.
