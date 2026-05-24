# API Аналитики Сессий

Базовый путь: `/api`

Все endpoints требуют JWT аутентификации (middleware `jwtAuth`).

## Endpoints

### Получить аналитику сессии
**GET** `/api/sessions/:sessionId/analytics`

Возвращает детальную аналитику по сессии чтения.

**Response:**
```json
{
  "success": true,
  "analytics": {
    "sessionId": "string",
    "peakListenerCount": 15,
    "averageListenerCount": 8,
    "totalListeners": 25,
    "totalListenTime": 5400,
    "averageSessionDuration": 216,
    "reactionCount": 42,
    "positiveReactionCount": 38,
    "negativeReactionCount": 4,
    "questionCount": 7,
    "listenerRegions": {
      "Russia": 18,
      "USA": 5,
      "Germany": 2
    },
    "listenerCities": {
      "Moscow": 12,
      "St. Petersburg": 6,
      "New York": 5
    },
    "deviceTypes": {
      "desktop": 15,
      "mobile": 8,
      "tablet": 2
    },
    "retention": {
      "1min": 20,
      "5min": 15,
      "10min": 10
    },
    "audioQualityScore": 85,
    "networkQualityScore": 78
  }
}
```

---

### Получить аналитику клуба
**GET** `/api/clubs/:clubId/analytics`

Возвращает агрегированную аналитику по всем сессиям клуба.

**Response:**
```json
{
  "success": true,
  "analytics": {
    "totalSessions": 10,
    "totalListeners": 250,
    "averageListeners": 25,
    "totalReactions": 420,
    "totalQuestions": 70,
    "averageQuality": 82
  }
}
```

---

### Получить аналитику всех сессий клуба
**GET** `/api/clubs/:clubId/analytics/sessions`

Возвращает аналитику по каждой сессии клуба.

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "sessionId": "session-1",
      "sessionTitle": "Чтение Главы 1",
      "startedAt": "2025-01-15T19:00:00Z",
      "endedAt": "2025-01-15T20:30:00Z",
      "analytics": {
        "peakListenerCount": 15,
        "averageListenerCount": 8,
        "totalListeners": 25,
        "totalListenTime": 5400,
        "averageSessionDuration": 216,
        "reactionCount": 42,
        "positiveReactionCount": 38,
        "negativeReactionCount": 4,
        "questionCount": 7,
        "audioQualityScore": 85,
        "networkQualityScore": 78
      }
    },
    ...
  ]
}
```

---

### Получить аналитику чтеца
**GET** `/api/users/:userId/analytics/reader`

Возвращает агрегированную аналитику по всем сессиям пользователя как чтеца.

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalSessions": 5,
    "totalListeners": 125,
    "averageListeners": 25,
    "totalReactions": 210,
    "totalQuestions": 35,
    "averageQuality": 84
  },
  "sessions": [
    {
      "sessionId": "session-1",
      "clubId": "club-123",
      "sessionTitle": "Чтение Главы 1",
      "startedAt": "2025-01-15T19:00:00Z",
      "endedAt": "2025-01-15T20:30:00Z",
      "analytics": { ... }
    },
    ...
  ]
}
```

---

### Экспорт аналитики сессии в CSV
**GET** `/api/sessions/:sessionId/analytics/export`

Экспортирует аналитику сессии в формате CSV.

**Response:**
```
Content-Type: text/csv
Content-Disposition: attachment; filename=session-{sessionId}-analytics.csv

Metric,Value
Session ID,session-123
Peak Listeners,15
Average Listeners,8
Total Listeners,25
Total Listen Time (seconds),5400
...
```

---

## Метрики

### Слушатели

| Метрика | Тип | Описание |
|---------|-----|----------|
| `peakListenerCount` | number | Пик количества слушателей одновременно |
| `averageListenerCount` | number | Среднее количество слушателей |
| `totalListeners` | number | Общее количество уникальных слушателей |
| `totalListenTime` | number | Общее время прослушивания (секунды) |
| `averageSessionDuration` | number | Средняя длительность сессии (секунды) |

### Взаимодействия

| Метрика | Тип | Описание |
|---------|-----|----------|
| `reactionCount` | number | Общее количество реакций |
| `positiveReactionCount` | number | Количество положительных реакций |
| `negativeReactionCount` | number | Количество отрицательных реакций |
| `questionCount` | number | Количество заданных вопросов |

### География и устройства

| Метрика | Тип | Описание |
|---------|-----|----------|
| `listenerRegions` | object | Распределение слушателей по регионам |
| `listenerCities` | object | Распределение слушателей по городам |
| `deviceTypes` | object | Распределение по типам устройств |

### Удержание

| Метрика | Тип | Описание |
|---------|-----|----------|
| `retention.1min` | number | Количество слушателей, прослушавших более 1 минуты |
| `retention.5min` | number | Количество слушателей, прослушавших более 5 минут |
| `retention.10min` | number | Количество слушателей, прослушавших более 10 минут |

### Качество

| Метрика | Тип | Описание |
|---------|-----|----------|
| `audioQualityScore` | number | Оценка качества аудио (0-100) |
| `networkQualityScore` | number | Оценка качества сети (0-100) |

---

## Примеры использования

### Получить аналитику сессии
```bash
curl -X GET http://localhost:5000/api/sessions/session-123/analytics \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Получить аналитику клуба
```bash
curl -X GET http://localhost:5000/api/clubs/club-123/analytics \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Получить аналитику чтеца
```bash
curl -X GET http://localhost:5000/api/users/user-456/analytics/reader \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Экспорт аналитики в CSV
```bash
curl -X GET http://localhost:5000/api/sessions/session-123/analytics/export \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o session-analytics.csv
```

---

## Интеграция с WebSocket

SessionAnalyticsService интегрируется с WebSocket для отслеживания в реальном времени:

### События отслеживания:

1. **listener_join** — слушатель подключился
```typescript
await sessionAnalyticsService.trackListenerJoin(sessionId, userId, ipAddress, userAgent);
```

2. **listener_leave** — слушатель отключился
```typescript
await sessionAnalyticsService.trackListenerLeave(sessionId, userId);
```

3. **reaction** — новая реакция
```typescript
await sessionAnalyticsService.trackReaction(sessionId, isPositive);
```

4. **question** — новый вопрос
```typescript
await sessionAnalyticsService.trackQuestion(sessionId);
```

5. **audio_quality** — обновление качества аудио
```typescript
await sessionAnalyticsService.updateAudioQuality(sessionId, score);
```

6. **network_quality** — обновление качества сети
```typescript
await sessionAnalyticsService.updateNetworkQuality(sessionId, score);
```

---

## Workflow аналитики

### 1. Инициализация сессии
```typescript
await sessionAnalyticsService.initializeSessionAnalytics(sessionId);
```

### 2. Отслеживание в реальном времени
```typescript
// При подключении слушателя
await sessionAnalyticsService.trackListenerJoin(sessionId, userId, ip, userAgent);

// При реакции
await sessionAnalyticsService.trackReaction(sessionId, true);

// При вопросе
await sessionAnalyticsService.trackQuestion(sessionId);
```

### 3. Финализация сессии
```typescript
const metrics = await sessionAnalyticsService.finalizeSessionAnalytics(sessionId);
```

### 4. Получение аналитики
```typescript
const analytics = await sessionAnalyticsService.getSessionAnalytics(sessionId);
```

---

## Связанные таблицы БД

- `session_analytics` — Основная таблица аналитики
- `reading_sessions` — Сессии чтения
- `clubs` — Клубы
- `users` — Пользователи
