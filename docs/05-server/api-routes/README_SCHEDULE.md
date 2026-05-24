# Schedule API

API для управления расписанием сессий чтения в VoxLibris Studio.

---

## Endpoints

### Создать расписание

**POST** `/api/schedule`

Тело запроса:
```json
{
  "clubId": "club-id",
  "bookId": "book-id",
  "title": "Чтение главы 1-3",
  "description": "Прочитаем первые три главы книги",
  "scheduledStart": "2024-01-20T18:00:00.000Z",
  "scheduledEnd": "2024-01-20T20:00:00.000Z",
  "estimatedDuration": 120,
  "startChapter": 1,
  "startPosition": "0",
  "endChapter": 3,
  "endPosition": null,
  "isRecurring": false,
  "recurringPattern": null,
  "reminderMinutes": 15
}
```

Параметры:
- `clubId` (обязательно) — ID клуба
- `bookId` (обязательно) — ID книги
- `title` (обязательно) — название расписания
- `description` (опционально) — описание
- `scheduledStart` (обязательно) — время начала (ISO 8601)
- `scheduledEnd` (опционально) — время окончания (ISO 8601)
- `estimatedDuration` (опционально) — предполагаемая длительность в минутах
- `startChapter` (опционально) — начальная глава
- `startPosition` (опционально) — начальная позиция (JSON)
- `endChapter` (опционально) — конечная глава
- `endPosition` (опционально) — конечная позиция (JSON)
- `isRecurring` (опционально) — повторяющееся расписание
- `recurringPattern` (опционально) — шаблон повторения (JSON)
- `reminderMinutes` (опционально) — за сколько минут напомнить

Ответ:
```json
{
  "success": true,
  "schedule": {
    "id": "schedule-id",
    "clubId": "club-id",
    "bookId": "book-id",
    "title": "Чтение главы 1-3",
    "description": "Прочитаем первые три главы книги",
    "scheduledStart": "2024-01-20T18:00:00.000Z",
    "scheduledEnd": "2024-01-20T20:00:00.000Z",
    "estimatedDuration": 120,
    "startChapter": 1,
    "startPosition": "0",
    "endChapter": 3,
    "endPosition": null,
    "status": "scheduled",
    "sessionId": null,
    "isRecurring": false,
    "recurringPattern": null,
    "reminderMinutes": 15,
    "remindersSent": false,
    "actualStart": null,
    "actualEnd": null,
    "attendeesCount": 0,
    "createdBy": "user-id",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

### Получить расписание по ID

**GET** `/api/schedule/:scheduleId`

Ответ:
```json
{
  "success": true,
  "schedule": { ... }
}
```

### Получить расписание клуба

**GET** `/api/schedule/club/:clubId`

Ответ:
```json
{
  "success": true,
  "schedules": [ ... ]
}
```

### Получить предстоящие расписания клуба

**GET** `/api/schedule/club/:clubId/upcoming`

Возвращает только расписания со статусом `scheduled` и временем начала в будущем.

Ответ:
```json
{
  "success": true,
  "schedules": [ ... ]
}
```

### Получить расписание по книге

**GET** `/api/schedule/club/:clubId/book/:bookId`

Ответ:
```json
{
  "success": true,
  "schedules": [ ... ]
}
```

### Получить расписания по статусу

**GET** `/api/schedule/club/:clubId/status/:status`

Статусы:
- `scheduled` — запланировано
- `in_progress` — в процессе
- `completed` — завершено
- `cancelled` — отменено

Ответ:
```json
{
  "success": true,
  "schedules": [ ... ]
}
```

### Обновить расписание

**PUT** `/api/schedule/:scheduleId`

Тело запроса (все поля опциональны):
```json
{
  "title": "Обновленное название",
  "description": "Обновленное описание",
  "scheduledStart": "2024-01-20T19:00:00.000Z",
  "scheduledEnd": "2024-01-20T21:00:00.000Z",
  "estimatedDuration": 120,
  "startChapter": 2,
  "startPosition": "100",
  "endChapter": 4,
  "endPosition": null,
  "isRecurring": false,
  "recurringPattern": null,
  "reminderMinutes": 30
}
```

**Примечание:** Только создатель расписания может его обновить.

Ответ:
```json
{
  "success": true,
  "schedule": { ... }
}
```

### Обновить статус расписания

**PUT** `/api/schedule/:scheduleId/status`

Тело запроса:
```json
{
  "status": "in_progress"
}
```

**Примечание:** Только создатель расписания может обновить статус.

Ответ:
```json
{
  "success": true,
  "schedule": { ... }
}
```

### Начать сессию по расписанию

**POST** `/api/schedule/:scheduleId/start`

Создает новую сессию чтения и связывает её с расписанием. Статус расписания меняется на `in_progress`.

**Примечание:** Только создатель расписания может начать сессию.

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
    "position": "0",
    "status": "active",
    "listenerCount": 0,
    "createdAt": "2024-01-20T18:00:00.000Z"
  },
  "schedule": { ... }
}
```

### Завершить сессию по расписанию

**POST** `/api/schedule/:scheduleId/complete`

Завершает связанную сессию чтения и меняет статус расписания на `completed`.

**Примечание:** Только создатель расписания может завершить сессию.

Ответ:
```json
{
  "success": true,
  "schedule": { ... }
}
```

### Удалить расписание

**DELETE** `/api/schedule/:scheduleId`

**Примечание:** Только создатель расписания может его удалить.

Ответ:
```json
{
  "success": true,
  "message": "Schedule deleted successfully"
}
```

### Получить статистику расписания клуба

**GET** `/api/schedule/club/:clubId/stats`

Ответ:
```json
{
  "success": true,
  "stats": {
    "total": 20,
    "scheduled": 5,
    "inProgress": 1,
    "completed": 13,
    "cancelled": 1
  }
}
```

---

## Статусы расписания

- **scheduled** — сессия запланирована, еще не началась
- **in_progress** — сессия идет в данный момент
- **completed** — сессия завершена
- **cancelled** — сессия отменена

---

## Повторяющиеся расписания

Для создания повторяющегося расписания используйте параметры:

```json
{
  "isRecurring": true,
  "recurringPattern": {
    "frequency": "weekly",
    "days": [1, 3, 5],
    "endDate": "2024-12-31"
  }
}
```

Параметры `recurringPattern`:
- `frequency` — частота: `daily`, `weekly`, `monthly`
- `days` — дни недели (для `weekly`): `[1, 2, 3, 4, 5, 6, 7]` (1 = понедельник)
- `endDate` — дата окончания повторений

---

## Напоминания

Параметр `reminderMinutes` определяет за сколько минут до начала отправлять напоминание участникам.

Типичные значения:
- `15` — за 15 минут
- `30` — за 30 минут
- `60` — за 1 час
- `1440` — за 1 день

---

## Использование с React

### Пример компонента расписания

```typescript
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function ScheduleList({ clubId }: { clubId: string }) {
  const [schedules, setSchedules] = useState([]);
  const [upcoming, setUpcoming] = useState([]);

  useEffect(() => {
    loadSchedules();
    loadUpcoming();
  }, [clubId]);

  const loadSchedules = async () => {
    const data = await api.get(`/schedule/club/${clubId}`);
    setSchedules(data.schedules);
  };

  const loadUpcoming = async () => {
    const data = await api.get(`/schedule/club/${clubId}/upcoming`);
    setUpcoming(data.schedules);
  };

  const createSchedule = async (values: any) => {
    await api.post('/schedule', {
      ...values,
      clubId,
    });
    loadSchedules();
    loadUpcoming();
  };

  const startSession = async (scheduleId: string) => {
    const data = await api.post(`/schedule/${scheduleId}/start`);
    // Перенаправляем на сессию
    window.location.href = `/reading-sessions/${data.session.id}`;
  };

  return (
    <div className="schedule-list">
      <h2>Предстоящие чтения</h2>
      {upcoming.length === 0 && <p>Нет запланированных чтений</p>}
      {upcoming.map(schedule => (
        <div key={schedule.id} className="schedule-item">
          <h3>{schedule.title}</h3>
          <p>
            📅 {new Date(schedule.scheduledStart).toLocaleString('ru-RU')}
          </p>
          {schedule.estimatedDuration && (
            <p>⏱️ {schedule.estimatedDuration} минут</p>
          )}
          <button onClick={() => startSession(schedule.id)}>
            Начать чтение
          </button>
        </div>
      ))}

      <h2>Все расписания</h2>
      {schedules.map(schedule => (
        <div key={schedule.id} className="schedule-item">
          <h3>{schedule.title}</h3>
          <p>Статус: {schedule.status}</p>
          {/* ... */}
        </div>
      ))}
    </div>
  );
}
```

### Пример формы создания расписания

```typescript
import { useState } from 'react';
import { api } from '@/lib/api';

export function CreateScheduleForm({ clubId, bookId }: { clubId: string; bookId: string }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    scheduledStart: '',
    scheduledEnd: '',
    estimatedDuration: 60,
    reminderMinutes: 15,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/schedule', {
      clubId,
      bookId,
      ...formData,
    });
    // Перенаправляем или обновляем список
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Название"
        value={formData.title}
        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
      />
      <textarea
        placeholder="Описание"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
      />
      <input
        type="datetime-local"
        value={formData.scheduledStart}
        onChange={(e) => setFormData({ ...formData, scheduledStart: e.target.value })}
      />
      <input
        type="datetime-local"
        value={formData.scheduledEnd}
        onChange={(e) => setFormData({ ...formData, scheduledEnd: e.target.value })}
      />
      <input
        type="number"
        placeholder="Длительность (мин)"
        value={formData.estimatedDuration}
        onChange={(e) => setFormData({ ...formData, estimatedDuration: Number(e.target.value) })}
      />
      <button type="submit">Создать расписание</button>
    </form>
  );
}
```

---

## Rate Limiting

Все endpoints защищены rate limiting:
- Общие: 500 запросов за 15 минут
- Auth: 5 попыток за 15 минут

---

## Ошибки

### Коды ошибок

- `400` — Bad Request (неверные параметры)
- `401` — Unauthorized (требуется авторизация)
- `403` — Forbidden (нет прав доступа)
- `404` — Not Found (ресурс не найден)
- `500` — Internal Server Error

### Формат ошибок

```json
{
  "success": false,
  "error": "Описание ошибки"
}
```
