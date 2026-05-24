# Фаза 8 — Аналитика ✅

## Обзор

Фаза 8 реализует систему аналитики сессий чтения с отслеживанием в реальном времени и агрегацией данных.

## Что было реализовано

### 1. SessionAnalyticsRepository (`server/repositories/SessionAnalyticsRepository.ts`)

**Основные функции:**
- CRUD для аналитики сессий
- Обновление статистики слушателей
- Обновление времени прослушивания
- Обновление реакций и вопросов
- Обновление показателей качества
- Обновление метаданных (география, устройства, удержание)

**Методы:**
- `createSessionAnalytics(analytics)` — создать аналитику
- `getSessionAnalytics(sessionId)` — получить аналитику сессии
- `updateListenerStats(sessionId, ...)` — обновить статистику слушателей
- `updateListenTime(sessionId, ...)` — обновить время прослушивания
- `updateReactionQuestionStats(sessionId, ...)` — обновить реакции и вопросы
- `updateQualityScores(sessionId, ...)` — обновить качество
- `updateMetadata(sessionId, ...)` — обновить метаданные

---

### 2. SessionAnalyticsService (`server/services/session-analytics-service.ts`)

**Основные функции:**
- Отслеживание слушателей в реальном времени
- Расчёт метрик (слушатели, удержание, география)
- Агрегация данных для дашборда
- Финализация аналитики сессии

**Методы:**
- `initializeSessionAnalytics(sessionId)` — инициализировать аналитику
- `trackListenerJoin(sessionId, userId, ip, userAgent)` — подключение слушателя
- `trackListenerLeave(sessionId, userId)` — отключение слушателя
- `trackReaction(sessionId, isPositive)` — отследить реакцию
- `trackQuestion(sessionId)` — отследить вопрос
- `updateAudioQuality(sessionId, score)` — обновить качество аудио
- `updateNetworkQuality(sessionId, score)` — обновить качество сети
- `finalizeSessionAnalytics(sessionId)` — финализировать сессию
- `getSessionAnalytics(sessionId)` — получить аналитику
- `getClubAnalytics(clubId)` — получить аналитику клуба

---

### 3. API Endpoints (`server/routes/session-analytics.ts`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/sessions/:sessionId/analytics` | Аналитика сессии |
| GET | `/api/clubs/:clubId/analytics` | Аналитика клуба |
| GET | `/api/clubs/:clubId/analytics/sessions` | Все сессии клуба |
| GET | `/api/users/:userId/analytics/reader` | Аналитика чтеца |
| GET | `/api/sessions/:sessionId/analytics/export` | Экспорт в CSV |

---

## Метрики

### Слушатели

| Метрика | Описание |
|---------|----------|
| `peakListenerCount` | Пик количества слушателей одновременно |
| `averageListenerCount` | Среднее количество слушателей |
| `totalListeners` | Общее количество уникальных слушателей |
| `totalListenTime` | Общее время прослушивания (секунды) |
| `averageSessionDuration` | Средняя длительность сессии (секунды) |

### Взаимодействия

| Метрика | Описание |
|---------|----------|
| `reactionCount` | Общее количество реакций |
| `positiveReactionCount` | Количество положительных реакций |
| `negativeReactionCount` | Количество отрицательных реакций |
| `questionCount` | Количество заданных вопросов |

### География и устройства

| Метрика | Описание |
|---------|----------|
| `listenerRegions` | Распределение слушателей по регионам |
| `listenerCities` | Распределение слушателей по городам |
| `deviceTypes` | Распределение по типам устройств (desktop, mobile, tablet) |

### Удержание

| Метрика | Описание |
|---------|----------|
| `retention.1min` | Количество слушателей, прослушавших более 1 минуты |
| `retention.5min` | Количество слушателей, прослушавших более 5 минут |
| `retention.10min` | Количество слушателей, прослушавших более 10 минут |

### Качество

| Метрика | Описание |
|---------|----------|
| `audioQualityScore` | Оценка качества аудио (0-100) |
| `networkQualityScore` | Оценка качества сети (0-100) |

---

## Workflow аналитики

### 1. Инициализация сессии
```typescript
await sessionAnalyticsService.initializeSessionAnalytics(sessionId);
```

### 2. Отслеживание в реальном времени
```typescript
// При подключении слушателя
await sessionAnalyticsService.trackListenerJoin(sessionId, userId, ipAddress, userAgent);

// При отключении слушателя
await sessionAnalyticsService.trackListenerLeave(sessionId, userId);

// При реакции
await sessionAnalyticsService.trackReaction(sessionId, true);

// При вопросе
await sessionAnalyticsService.trackQuestion(sessionId);

// Обновление качества
await sessionAnalyticsService.updateAudioQuality(sessionId, 85);
await sessionAnalyticsService.updateNetworkQuality(sessionId, 78);
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

## Расчёт метрик

### Скользящее среднее

Для сглаживания показателей используется скользящее среднее:

```typescript
const newValue = (oldValue * 0.8 + incomingValue * 0.2);
```

Это помогает избежать резких скачков в метриках.

### Удержание

Удержание рассчитывается на основе времени прослушивания каждого слушателя:

```typescript
if (duration >= 60) retention['1min']++;
if (duration >= 300) retention['5min']++;
if (duration >= 600) retention['10min']++;
```

### Определение устройства

Тип устройства определяется на основе User-Agent:

```typescript
if (/mobile|android|iphone|ipod/i.test(ua) && !/tablet|ipad/i.test(ua)) {
  return 'mobile';
}
if (/tablet|ipad/i.test(ua)) {
  return 'tablet';
}
return 'desktop';
```

---

## Экспорт данных

### CSV формат

Экспорт включает все метрики сессии:

```
Metric,Value
Session ID,session-123
Peak Listeners,15
Average Listeners,8
Total Listeners,25
Total Listen Time (seconds),5400
Average Session Duration (seconds),216
Total Reactions,42
Positive Reactions,38
Negative Reactions,4
Total Questions,7
Audio Quality Score,85
Network Quality Score,78

Listener Regions
Russia,18
USA,5
Germany,2

Listener Cities
Moscow,12
St. Petersburg,6
New York,5

Device Types
desktop,15
mobile,8
tablet,2

Retention
1min,20
5min,15
10min,10
```

---

## Интеграция с WebSocket

События отслеживания вызываются через WebSocket хендлеры:

```typescript
// В reading-sessions.ts
socket.on('listener_join', async (data) => {
  await sessionAnalyticsService.trackListenerJoin(
    data.sessionId,
    data.userId,
    data.ipAddress,
    data.userAgent
  );
});

socket.on('listener_leave', async (data) => {
  await sessionAnalyticsService.trackListenerLeave(
    data.sessionId,
    data.userId
  );
});
```

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

## Документация

- [API Аналитики Сессий](./routes/README_SESSION_ANALYTICS_API.md)
- [Общая аналитика](./analytics-routes.ts)

---

## Следующие шаги (Frontend)

### Требуется реализовать:

1. **Дашборд чтеца**
   - Общая статистика сессий
   - Графики слушателей
   - Карта аудитории

2. **Графики и метрики**
   - График количества слушателей во времени
   - График удержания
   - График реакций
   - Диаграмма по регионам
   - Диаграмма по устройствам

3. **Экспорт данных**
   - Кнопка экспорта в CSV
   - Выбор периода
   - Фильтрация по метрикам

4. **Интеграция с WebSocket**
   - Отправка событий отслеживания
   - Обновление метрик в реальном времени

---

## Статус

**Backend:** ✅ Завершено
**Frontend:** ⏳ Не начато

Прогресс фазы: 100% (только Backend)
