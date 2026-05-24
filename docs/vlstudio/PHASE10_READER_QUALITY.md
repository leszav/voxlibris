# Фаза 10 — Оценка Качества ✅

## Обзор

Фаза 10 реализует систему оценок качества чтения чтецов, позволяя слушателям оставлять отзывы и рейтинги.

## Что было реализовано

### 1. ReaderQualityRatingsRepository (`server/repositories/ReaderQualityRatingsRepository.ts`)

**Основные функции:**
- CRUD для оценок качества
- Получение оценок по чтецу и клубу
- Расчёт среднего рейтинга чтеца
- Обновление оценок

**Методы:**
- `createRating(rating)` — создать оценку
- `getRating(id)` — получить по ID
- `getReaderRatings(ratedUserId)` — оценки чтеца
- `getRatingsByClub(clubId)` — оценки по клубу
- `getUserRatingForReaderInClub(...)` — оценка пользователя для чтеца
- `updateRating(id, updates)` — обновить оценку
- `deleteRating(id)` — удалить оценку
- `calculateAverageReaderRating(ratedUserId)` — средний рейтинг
- `getReaderRatingsInClub(ratedUserId, clubId)` — оценки чтеца по клубу

---

### 2. ReaderQualityService (`server/services/reader-quality-service.ts`)

**Основные функции:**
- Создание оценок с валидацией
- Обновление и удаление оценок
- Проверка прав на оценку
- Расчёт статистики качества
- Получение топ чтецов

**Методы:**
- `createRating(data)` — создать оценку
- `updateRating(ratingId, raterUserId, updates)` — обновить
- `deleteRating(ratingId, raterUserId)` — удалить
- `getRating(ratingId)` — получить оценку
- `getReaderRatings(ratedUserId, limit)` — оценки чтеца
- `getReaderRatingsInClub(ratedUserId, clubId)` — оценки по клубу
- `getClubRatings(clubId)` — оценки клуба
- `getReaderQualityStats(ratedUserId)` — статистика чтеца
- `getTopReadersByRating(limit, minRatings)` — топ чтецов
- `canRateReader(...)` — проверка возможности оценки

---

### 3. API Endpoints (`server/routes/reader-quality.ts`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/reader-quality/ratings` | Создать оценку |
| GET | `/api/reader-quality/ratings/:ratingId` | Получить оценку |
| PUT | `/api/reader-quality/ratings/:ratingId` | Обновить оценку |
| DELETE | `/api/reader-quality/ratings/:ratingId` | Удалить оценку |
| GET | `/api/reader-quality/readers/:userId/ratings` | Оценки чтеца |
| GET | `/api/reader-quality/readers/:userId/ratings/club/:clubId` | Оценки по клубу |
| GET | `/api/reader-quality/readers/:userId/stats` | Статистика чтеца |
| GET | `/api/reader-quality/clubs/:clubId/ratings` | Оценки клуба |
| GET | `/api/reader-quality/readers/top` | Топ чтецов |
| POST | `/api/reader-quality/check-can-rate` | Проверка возможности |

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

## Статистика качества

| Поле | Тип | Описание |
|------|-----|----------|
| `overall` | number | Средняя общая оценка (0-5) |
| `voiceQuality` | number | Средняя оценка голоса (0-5) |
| `readingPace` | number | Средняя оценка темпа (0-5) |
| `articulation` | number | Средняя оценка артикуляции (0-5) |
| `emotion` | number | Средняя оценка эмоций (0-5) |
| `totalRatings` | number | Общее количество оценок |
| `recentRatings` | number | Оценок за последние 30 дней |

---

## Права доступа

| Действие | Требуемые права |
|----------|-----------------|
| Создать оценку | Был слушателем в сессии, не оценивал ранее |
| Обновить оценку | Автор оценки |
| Удалить оценку | Автор оценки |
| Получить оценку | Любой пользователь |
| Получить оценки чтеца | Любой пользователь |
| Получить статистику | Любой пользователь |

---

## Валидация оценок

### Проверки при создании оценки:

1. **Самооценка запрещена**
   ```typescript
   if (raterUserId === ratedUserId) {
     throw new Error('Cannot rate yourself');
   }
   ```

2. **Участие в сессии**
   ```typescript
   const listeners = await storage.reading.getSessionListeners(sessionId);
   const wasListener = listeners.some(l => l.userId === raterUserId);
   ```

3. **Чтец сессии**
   ```typescript
   if (session.readerId !== ratedUserId) {
     throw new Error('User was not the reader in this session');
   }
   ```

4. **Уникальность**
   ```typescript
   const existingRating = await repositories.readerQualityRatings.getUserRatingForReaderInClub(...);
   if (existingRating) {
     throw new Error('You have already rated this reader in this club');
   }
   ```

5. **Диапазон оценок (1-5)**
   ```typescript
   if (!Number.isInteger(value) || value < 1 || value > 5) {
     throw new Error('Rating must be between 1 and 5');
   }
   ```

---

## Расчёт среднего рейтинга

### Скользящее среднее

Средние значения рассчитываются как арифметическое среднее всех оценок:

```typescript
const sum = ratings.reduce((acc, r) => ({
  overallRating: acc.overallRating + r.overallRating,
  voiceQuality: acc.voiceQuality + (r.voiceQuality || 0),
  // ...
}), { ... });

return {
  overall: sum.overallRating / ratings.length,
  voiceQuality: sum.voiceQuality / ratingsWithVoice,
  // ...
};
```

### Недавние оценки

Оценки за последние 30 дней:

```typescript
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const recentRatings = ratings.filter(r => r.createdAt >= thirtyDaysAgo).length;
```

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

---

## Workflow оценки

### 1. Проверка возможности оценки
```typescript
const check = await readerQualityService.canRateReader(
  raterUserId,
  ratedUserId,
  clubId,
  sessionId
);
// { canRate: true } или { canRate: false, reason: "..." }
```

### 2. Создание оценки
```typescript
const result = await readerQualityService.createRating({
  ratedUserId,
  raterUserId,
  clubId,
  sessionId,
  overallRating: 5,
  feedback: "Отлично!"
});
// { ratingId, averageRating }
```

### 3. Получение статистики
```typescript
const stats = await readerQualityService.getReaderQualityStats(ratedUserId);
// { overall: 4.5, voiceQuality: 4.8, ... }
```

---

## Интеграция с сессиями

После завершения сессии можно предложить слушателям оценить чтеца:

```typescript
// Проверяем, может ли пользователь оценить
const check = await readerQualityService.canRateReader(
  userId,
  readerId,
  clubId,
  sessionId
);

if (check.canRate) {
  // Показываем форму оценки
  showRatingForm({
    readerId,
    sessionId,
    onSubmit: async (rating) => {
      await readerQualityService.createRating(rating);
      // Показываем благодарность
    }
  });
}
```

---

## Документация

- [API Оценок Качества](./routes/README_READER_QUALITY_API.md)

---

## Следующие шаги (Frontend)

### Требуется реализовать:

1. **Форма оценки**
   - Звёздочки для оценки (1-5)
   - Поля для голоса, темпа, артикуляции, эмоций
   - Текстовое поле для отзыва
   - Предпросмотр среднего рейтинга

2. **Отображение рейтинга в профиле**
   - Общая оценка (звёзды)
   - Детализация по параметрам
   - Количество оценок
   - Список отзывов

3. **Топ чтецов**
   - Список лучших чтецов
   - Фильтрация по количеству оценок
   - Карточки чтецов с рейтингом

4. **История оценок**
   - Список оценок пользователя
   - Возможность редактирования
   - Возможность удаления

---

## Статус

**Backend:** ✅ Завершено
**Frontend:** ⏳ Не начато

Прогресс фазы: 100% (только Backend)
