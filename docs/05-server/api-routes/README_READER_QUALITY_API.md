# API Оценок Качества Чтецов

Базовый путь: `/api/reader-quality`

Все endpoints требуют JWT аутентификации (middleware `jwtAuth`).

## Endpoints

### Создать оценку
**POST** `/api/reader-quality/ratings`

Создаёт новую оценку чтеца.

**Body:**
```json
{
  "ratedUserId": "string",
  "clubId": "string",
  "sessionId": "string",
  "voiceQuality": 5,
  "readingPace": 4,
  "articulation": 5,
  "emotion": 4,
  "overallRating": 5,
  "feedback": "Отличное чтение!"
}
```

**Response:**
```json
{
  "success": true,
  "ratingId": "rating-123",
  "averageRating": {
    "overall": 4.5,
    "voiceQuality": 4.8,
    "readingPace": 4.5,
    "articulation": 4.7,
    "emotion": 4.2,
    "totalRatings": 10,
    "recentRatings": 3
  }
}
```

**Ограничения:**
- Нельзя оценивать самого себя
- Пользователь должен был быть слушателем в сессии
- Одна оценка на чтеца в клубе
- Оценки от 1 до 5

---

### Получить оценку по ID
**GET** `/api/reader-quality/ratings/:ratingId`

Возвращает детали оценки по её ID.

**Response:**
```json
{
  "success": true,
  "rating": {
    "id": "rating-123",
    "ratedUserId": "user-456",
    "raterUserId": "user-789",
    "clubId": "club-123",
    "sessionId": "session-456",
    "voiceQuality": 5,
    "readingPace": 4,
    "articulation": 5,
    "emotion": 4,
    "overallRating": 5,
    "feedback": "Отличное чтение!",
    "createdAt": "2025-02-08T12:00:00Z",
    "updatedAt": "2025-02-08T12:00:00Z"
  }
}
```

---

### Обновить оценку
**PUT** `/api/reader-quality/ratings/:ratingId`

Обновляет существующую оценку.

**Body:**
```json
{
  "voiceQuality": 5,
  "readingPace": 5,
  "overallRating": 5,
  "feedback": "Обновлённый отзыв"
}
```

**Ограничения:**
- Только автор оценки может обновлять

---

### Удалить оценку
**DELETE** `/api/reader-quality/ratings/:ratingId`

Удаляет оценку.

**Ограничения:**
- Только автор оценки может удалять

---

### Получить оценки чтеца
**GET** `/api/reader-quality/readers/:userId/ratings?limit=10`

Возвращает все оценки чтеца.

**Query Parameters:**
- `limit` — ограничение количества (опционально)

**Response:**
```json
{
  "success": true,
  "ratings": [ ... ]
}
```

---

### Получить оценки чтеца по клубу
**GET** `/api/reader-quality/readers/:userId/ratings/club/:clubId`

Возвращает оценки чтеца в конкретном клубе.

**Response:**
```json
{
  "success": true,
  "ratings": [ ... ]
}
```

---

### Получить статистику качества чтеца
**GET** `/api/reader-quality/readers/:userId/stats`

Возвращает агрегированную статистику качества чтеца.

**Response:**
```json
{
  "success": true,
  "stats": {
    "overall": 4.5,
    "voiceQuality": 4.8,
    "readingPace": 4.5,
    "articulation": 4.7,
    "emotion": 4.2,
    "totalRatings": 10,
    "recentRatings": 3
  }
}
```

---

### Получить оценки по клубу
**GET** `/api/reader-quality/clubs/:clubId/ratings`

Возвращает все оценки в клубе.

**Response:**
```json
{
  "success": true,
  "ratings": [ ... ]
}
```

---

### Получить топ чтецов
**GET** `/api/reader-quality/readers/top?limit=10&minRatings=5`

Возвращает топ чтецов по рейтингу.

**Query Parameters:**
- `limit` — количество чтецов (по умолчанию 10)
- `minRatings` — минимальное количество оценок (по умолчанию 5)

**Response:**
```json
{
  "success": true,
  "topReaders": [
    {
      "userId": "user-123",
      "username": "Иван Иванов",
      "stats": {
        "overall": 4.9,
        "voiceQuality": 5.0,
        "readingPace": 4.8,
        "articulation": 4.9,
        "emotion": 4.7,
        "totalRatings": 15,
        "recentRatings": 5
      }
    },
    ...
  ]
}
```

---

### Проверить возможность оценки
**POST** `/api/reader-quality/check-can-rate`

Проверяет, может ли пользователь оценить чтеца.

**Body:**
```json
{
  "ratedUserId": "user-456",
  "clubId": "club-123",
  "sessionId": "session-456"
}
```

**Response:**
```json
{
  "success": true,
  "canRate": true
}
```

Или если нельзя:

```json
{
  "success": true,
  "canRate": false,
  "reason": "You have already rated this reader in this club"
}
```

---

## Параметры оценки

| Параметр | Тип | Обязательный | Диапазон | Описание |
|----------|-----|-------------|----------|----------|
| `voiceQuality` | number | Нет | 1-5 | Качество голоса |
| `readingPace` | number | Нет | 1-5 | Темп чтения |
| `articulation` | number | Нет | 1-5 | Артикуляция/произношение |
| `emotion` | number | Нет | 1-5 | Эмоциональность |
| `overallRating` | number | Да | 1-5 | Общая оценка |
| `feedback` | string | Нет | - | Текстовый отзыв |

---

## Статистика

| Поле | Тип | Описание |
|------|-----|----------|
| `overall` | number | Средняя общая оценка |
| `voiceQuality` | number | Средняя оценка голоса |
| `readingPace` | number | Средняя оценка темпа |
| `articulation` | number | Средняя оценка артикуляции |
| `emotion` | number | Средняя оценка эмоций |
| `totalRatings` | number | Общее количество оценок |
| `recentRatings` | number | Оценок за последние 30 дней |

---

## Права доступа

| Действие | Требуемые права |
|----------|-----------------|
| Создать оценку | Был слушателем в сессии |
| Обновить оценку | Автор оценки |
| Удалить оценку | Автор оценки |
| Получить оценку | Любой пользователь |
| Получить оценки чтеца | Любой пользователь |
| Получить статистику | Любой пользователь |

---

## Примеры использования

### Создать оценку
```bash
curl -X POST http://localhost:5000/api/reader-quality/ratings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ratedUserId": "user-456",
    "clubId": "club-123",
    "sessionId": "session-456",
    "voiceQuality": 5,
    "readingPace": 4,
    "articulation": 5,
    "emotion": 4,
    "overallRating": 5,
    "feedback": "Отличное чтение!"
  }'
```

### Получить статистику чтеца
```bash
curl -X GET http://localhost:5000/api/reader-quality/readers/user-456/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Получить топ чтецов
```bash
curl -X GET "http://localhost:5000/api/reader-quality/readers/top?limit=5&minRatings=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Проверить возможность оценки
```bash
curl -X POST http://localhost:5000/api/reader-quality/check-can-rate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ratedUserId": "user-456",
    "clubId": "club-123",
    "sessionId": "session-456"
  }'
```

---

## Workflow оценки

### 1. Проверка возможности оценки
```bash
POST /api/reader-quality/check-can-rate
{
  "ratedUserId": "user-456",
  "clubId": "club-123",
  "sessionId": "session-456"
}

→ { "canRate": true }
```

### 2. Создание оценки
```bash
POST /api/reader-quality/ratings
{
  "ratedUserId": "user-456",
  "clubId": "club-123",
  "sessionId": "session-456",
  "overallRating": 5,
  "feedback": "Отлично!"
}

→ { "ratingId": "rating-123", "averageRating": {...} }
```

### 3. Обновление оценки (опционально)
```bash
PUT /api/reader-quality/ratings/rating-123
{
  "feedback": "Обновлённый отзыв"
}

→ { "averageRating": {...} }
```

### 4. Получение статистики
```bash
GET /api/reader-quality/readers/user-456/stats

→ { "stats": {...} }
```

---

## Интеграция с сессиями

После завершения сессии можно предложить слушателям оценить чтеца:

```typescript
// Проверяем, может ли пользователь оценить
const check = await fetch('/api/reader-quality/check-can-rate', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ ratedUserId, clubId, sessionId })
});

if (check.canRate) {
  // Показываем форму оценки
  showRatingForm();
}
```

---

## Связанные таблицы БД

- `reader_quality_ratings` — Основная таблица оценок
- `reading_sessions` — Сессии чтения
- `clubs` — Клубы
- `users` — Пользователи (чтецы и слушатели)
