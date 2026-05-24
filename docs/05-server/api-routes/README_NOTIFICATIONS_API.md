# API Уведомлений

Базовый путь: `/api/notifications`

Все endpoints требуют JWT аутентификации (middleware `jwtAuth`).

## Endpoints

### Получить настройки уведомлений
**GET** `/api/notifications/settings`

Возвращает настройки уведомлений текущего пользователя.

**Response:**
```json
{
  "success": true,
  "settings": {
    "userId": "string",
    "emailEnabled": true,
    "pushEnabled": true,
    "reminderMinutes": 15,
    "sessionStart": true,
    "sessionEnd": false,
    "newQuestion": true
  }
}
```

---

### Обновить настройки уведомлений
**PUT** `/api/notifications/settings`

Обновляет настройки уведомлений текущего пользователя.

**Body:**
```json
{
  "emailEnabled": true,
  "pushEnabled": true,
  "reminderMinutes": 15,
  "sessionStart": true,
  "sessionEnd": false,
  "newQuestion": true
}
```

**Response:**
```json
{
  "success": true,
  "settings": { ... }
}
```

---

## Настройки уведомлений

| Параметр | Тип | Описание |
|----------|-----|----------|
| `userId` | string | ID пользователя (только для чтения) |
| `emailEnabled` | boolean | Включить email-уведомления |
| `pushEnabled` | boolean | Включить push-уведомления (в разработке) |
| `reminderMinutes` | number | За сколько минут напоминать о сессии (по умолчанию 15) |
| `sessionStart` | boolean | Уведомлять о начале сессии |
| `sessionEnd` | boolean | Уведомлять о завершении сессии |
| `newQuestion` | boolean | Уведомлять о новых вопросах |

---

## Типы уведомлений

| Тип | Описание |
|-----|----------|
| `session_reminder` | Напоминание о предстоящей сессии |
| `session_start` | Уведомление о начале сессии |
| `session_end` | Уведомление о завершении сессии |
| `new_question` | Уведомление о новом вопросе |
| `new_reaction` | Уведомление о новой реакции |

---

## Каналы уведомлений

| Канал | Статус | Описание |
|-------|--------|----------|
| `email` | ✅ Активен | Email через EmailService (nodemailer) |
| `push` | 🚧 В разработке | Push-уведомления (будет реализовано) |
| `websocket` | ✅ Активен | WebSocket в реальном времени |

---

## Планировщик (Scheduler)

Планировщик запускается автоматически при старте сервера в режиме production или если переменная окружения `ENABLE_SCHEDULER=true`.

### Задачи планировщика

| Задача | Расписание | Описание |
|--------|------------|----------|
| `check-schedule` | `* * * * *` (каждую минуту) | Проверка расписания и отправка напоминаний |
| `cleanup-old-data` | `0 * * * *` (каждый час) | Очистка старых данных |

### Как работают напоминания

1. Планировщик проверяет все расписания со статусом `scheduled`
2. Если до начала сессии осталось `reminderMinutes` минут (плюс-минус 1 минута), отправляется напоминание
3. Напоминания отправляются всем участникам клуба
4. После отправки устанавливается флаг `remindersSent: true`

---

## Примеры использования

### Получить настройки уведомлений
```bash
curl -X GET http://localhost:5000/api/notifications/settings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Обновить настройки уведомлений
```bash
curl -X PUT http://localhost:5000/api/notifications/settings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "emailEnabled": true,
    "reminderMinutes": 30,
    "sessionStart": true
  }'
```

### Ручной запуск планировщика (для тестирования)
```typescript
import { scheduler } from './services/scheduler.js';

await scheduler.manualCheckSchedule();
```

---

## Хранение настроек

Настройки уведомлений хранятся в таблице `settings` с ключами формата:

- `notifications.{userId}.email_enabled`
- `notifications.{userId}.push_enabled`
- `notifications.{userId}.reminder_minutes`
- `notifications.{userId}.session_start`
- `notifications.{userId}.session_end`
- `notifications.{userId}.new_question`

---

## Интеграция с расписанием

Уведомления интегрированы с API расписания:

1. **При начале сессии** (`POST /api/schedule/:scheduleId/start`)
   - Отправляются уведомления `session_start` всем участникам клуба

2. **При завершении сессии** (`POST /api/schedule/:scheduleId/complete`)
   - Отправляются уведомления `session_end` всем участникам клуба

3. **По расписанию** (автоматически через планировщик)
   - Отправляются уведомления `session_reminder` за `reminderMinutes` до начала
