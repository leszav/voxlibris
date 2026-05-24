# API Расписания Сессий Чтения

Базовый путь: `/api/schedule`

Все endpoints требуют JWT аутентификации (middleware `jwtAuth`).

## Endpoints

### Создать расписание
**POST** `/api/schedule`

Создаёт новое расписание сессии чтения в клубе.

**Body:**
```json
{
  "clubId": "string",
  "bookId": "string",
  "title": "string",
  "description": "string (optional)",
  "scheduledStart": "ISO 8601 datetime",
  "scheduledEnd": "ISO 8601 datetime (optional)",
  "estimatedDuration": "number (minutes, optional)",
  "startChapter": "number (optional)",
  "startPosition": "string (optional)",
  "endChapter": "number (optional)",
  "endPosition": "string (optional)",
  "isRecurring": "boolean (optional)",
  "recurringPattern": "string (optional)",
  "reminderMinutes": "number (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "schedule": { ... }
}
```

**Ограничения:**
- Пользователь должен быть членом клуба
- Книга должна существовать

---

### Получить расписание по ID
**GET** `/api/schedule/:scheduleId`

Возвращает детали расписания по его ID.

**Response:**
```json
{
  "success": true,
  "schedule": { ... }
}
```

---

### Получить расписание клуба
**GET** `/api/schedule/club/:clubId`

Возвращает все расписания клуба.

**Response:**
```json
{
  "success": true,
  "schedules": [ ... ]
}
```

---

### Получить предстоящие расписания клуба
**GET** `/api/schedule/club/:clubId/upcoming`

Возвращает предстоящие расписания клуба (статус `scheduled` и `scheduledStart` в будущем).

**Response:**
```json
{
  "success": true,
  "schedules": [ ... ]
}
```

---

### Получить расписания по книге
**GET** `/api/schedule/club/:clubId/book/:bookId`

Возвращает расписания для конкретной книги в клубе.

**Response:**
```json
{
  "success": true,
  "schedules": [ ... ]
}
```

---

### Получить расписания по статусу
**GET** `/api/schedule/club/:clubId/status/:status`

Возвращает расписания с указанным статусом.

**Параметры:**
- `status`: `scheduled` | `in_progress` | `completed` | `cancelled`

**Response:**
```json
{
  "success": true,
  "schedules": [ ... ]
}
```

---

### Обновить расписание
**PUT** `/api/schedule/:scheduleId`

Обновляет детали расписания.

**Body:**
```json
{
  "title": "string (optional)",
  "description": "string (optional)",
  "scheduledStart": "ISO 8601 datetime (optional)",
  "scheduledEnd": "ISO 8601 datetime (optional)",
  "estimatedDuration": "number (optional)",
  "startChapter": "number (optional)",
  "startPosition": "string (optional)",
  "endChapter": "number (optional)",
  "endPosition": "string (optional)",
  "isRecurring": "boolean (optional)",
  "recurringPattern": "string (optional)",
  "reminderMinutes": "number (optional)"
}
```

**Ограничения:**
- Только создатель расписания может его обновлять

---

### Обновить статус расписания
**PUT** `/api/schedule/:scheduleId/status`

Обновляет статус расписания.

**Body:**
```json
{
  "status": "scheduled" | "in_progress" | "completed" | "cancelled"
}
```

**Ограничения:**
- Только создатель расписания может обновлять его статус

---

### Начать сессию по расписанию
**POST** `/api/schedule/:scheduleId/start`

Создаёт сессию чтения на основе расписания и связывает их.

**Ограничения:**
- Только создатель расписания может начать сессию
- Расписание должно быть в статусе `scheduled`

**Response:**
```json
{
  "success": true,
  "session": { ... },
  "schedule": { ... }
}
```

---

### Завершить сессию по расписанию
**POST** `/api/schedule/:scheduleId/complete`

Завершает связанную сессию чтения и обновляет статус расписания на `completed`.

**Ограничения:**
- Только создатель расписания может завершить сессию

**Response:**
```json
{
  "success": true,
  "schedule": { ... }
}
```

---

### Удалить расписание
**DELETE** `/api/schedule/:scheduleId`

Удаляет расписание.

**Ограничения:**
- Только создатель расписания может его удалить

**Response:**
```json
{
  "success": true,
  "message": "Schedule deleted successfully"
}
```

---

### Получить статистику расписания клуба
**GET** `/api/schedule/club/:clubId/stats`

Возвращает статистику по расписаниям клуба.

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 10,
    "scheduled": 5,
    "inProgress": 2,
    "completed": 3,
    "cancelled": 0
  }
}
```

---

## Статусы расписания

- `scheduled` — Запланировано (по умолчанию)
- `in_progress` — В процессе
- `completed` — Завершено
- `cancelled` — Отменено

---

## Примеры использования

### Создание расписания
```bash
curl -X POST http://localhost:5000/api/schedule \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clubId": "club-123",
    "bookId": "book-456",
    "title": "Вечернее чтение: Глава 1-3",
    "description": "Регулярное чтение по вечерам",
    "scheduledStart": "2024-02-01T19:00:00Z",
    "estimatedDuration": 90,
    "startChapter": 1,
    "endChapter": 3
  }'
```

### Получение предстоящих расписаний
```bash
curl -X GET http://localhost:5000/api/schedule/club/club-123/upcoming \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Начало сессии по расписанию
```bash
curl -X POST http://localhost:5000/api/schedule/schedule-789/start \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Связанные таблицы БД

- `reading_schedules` — Основная таблица расписаний
- `reading_sessions` — Сессии чтения (связываются через `sessionId`)
- `clubs` — Клубы
- `books` — Книги
- `users` — Пользователи (создатели расписаний)
