# Фаза 6 — Уведомления и напоминания ✅

## Обзор

Фаза 6 реализует систему уведомлений для VoxLibris Studio, включая автоматические напоминания о сессиях и настройки уведомлений для пользователей.

## Что было реализовано

### 1. NotificationService (`server/services/notification-service.ts`)

**Основные функции:**
- Отправка email-уведомлений через существующий EmailService
- Хранение настроек уведомлений в таблице `settings`
- Поддержка нескольких каналов (email, push, websocket)
- HTML-шаблоны для разных типов уведомлений

**Методы:**
- `getUserNotificationSettings(userId)` — получить настройки пользователя
- `updateUserNotificationSettings(userId, updates)` — обновить настройки
- `sendNotification(payload, channels)` — отправить уведомление
- `sendSessionReminder(schedule, userId, email)` — напоминание о сессии
- `sendSessionStartNotification(schedule, userId, email)` — уведомление о начале
- `sendSessionEndNotification(schedule, userId, email)` — уведомление о завершении

---

### 2. Scheduler (`server/services/scheduler.ts`)

**Основные функции:**
- Автоматическая проверка расписания каждую минуту
- Отправка напоминаний за `reminderMinutes` до начала сессии
- Очистка старых данных (каждый час)

**Задачи планировщика:**
- `check-schedule` — `* * * * *` (каждую минуту)
- `cleanup-old-data` — `0 * * * *` (каждый час)

**Условия запуска:**
- Автоматически запускается в `NODE_ENV=production`
- Или при `ENABLE_SCHEDULER=true`

---

### 3. API Endpoints (`server/routes/notifications.ts`)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/notifications/settings` | Получить настройки |
| PUT | `/api/notifications/settings` | Обновить настройки |

---

### 4. Интеграция с расписанием (`server/routes/schedule.ts`)

**При начале сессии:**
```typescript
POST /api/schedule/:scheduleId/start
```
- Создаётся сессия чтения
- Отправляются уведомления `session_start` всем участникам клуба

**При завершении сессии:**
```typescript
POST /api/schedule/:scheduleId/complete
```
- Статус расписания меняется на `completed`
- Отправляются уведомления `session_end` всем участникам клуба

**Автоматические напоминания:**
- Планировщик проверяет расписание каждую минуту
- Если до начала осталось `reminderMinutes` минут (±1 мин), отправляется напоминание
- Устанавливается флаг `remindersSent: true`

---

## Настройки уведомлений

Параметры хранятся в таблице `settings`:

| Ключ | Тип | Описание |
|------|-----|----------|
| `notifications.{userId}.email_enabled` | boolean | Включить email |
| `notifications.{userId}.push_enabled` | boolean | Включить push |
| `notifications.{userId}.reminder_minutes` | number | Минут до напоминания |
| `notifications.{userId}.session_start` | boolean | Уведомлять о начале |
| `notifications.{userId}.session_end` | boolean | Уведомлять о завершении |
| `notifications.{userId}.new_question` | boolean | Уведомлять о вопросах |

---

## Типы уведомлений

1. **session_reminder** — Напоминание о предстоящей сессии
   - Отправляется автоматически планировщиком
   - Всем участникам клуба

2. **session_start** — Уведомление о начале сессии
   - Отправляется при запуске сессии по расписанию
   - Всем участникам клуба (кроме инициатора)

3. **session_end** — Уведомление о завершении сессии
   - Отправляется при завершении сессии
   - Всем участникам клуба (кроме инициатора)

4. **new_question** — Новый вопрос (заготовка)
   - Будет использоваться для чат-вопросов

5. **new_reaction** — Новая реакция (заготовка)
   - Будет использоваться для эмодзи-реакций

---

## Email-шаблоны

Все уведомления отправляются в формате HTML с брендированием VoxLibris.

**Стиль:**
- Цветовая схема: `#5C4033` (тёмно-коричневый), `#D4A574` (золотистый)
- Шрифты: "DM Sans", "Playfair Display"
- Адаптивный дизайн

**Примеры:**
- Напоминание о сессии включает дату, время и описание
- Уведомление о начале включает кнопку "Подключиться"
- Уведомление о завершении содержит благодарность

---

## Зависимости

Добавлены в `package.json`:
```json
{
  "dependencies": {
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11"
  }
}
```

---

## Запуск планировщика

### Production (автоматически)
```bash
NODE_ENV=production npm start
```

### Development (ручной запуск)
```bash
ENABLE_SCHEDULER=true npm run dev
```

### Тестирование планировщика
```typescript
import { scheduler } from './services/scheduler.js';

// Ручной запуск проверки расписания
await scheduler.manualCheckSchedule();
```

---

## Следующие шаги (Frontend)

### Требуется реализовать:

1. **UI настроек уведомлений**
   - Форма с переключателями для каждого типа уведомлений
   - Поле ввода для `reminderMinutes`
   - Сохранение настроек через API

2. **История уведомлений**
   - Список полученных уведомлений
   - Фильтрация по типу и дате
   - Отметка как прочитанного

3. **Push-уведомления**
   - Service Worker для браузера
   - Подписка на push-уведомления
   - Интеграция с VAPID

4. **WebSocket-уведомления в реальном времени**
   - Отображение всплывающих уведомлений
   - Звуковые сигналы
   - Центр уведомлений в UI

---

## Документация

- [API Уведомлений](./routes/README_NOTIFICATIONS_API.md)
- [API Расписания](./routes/README_SCHEDULE_API.md)
- [EmailService](./services/email-service.ts)

---

## Статус

**Backend:** ✅ Завершено
**Frontend:** ⏳ Не начато

Прогресс фазы: 100% (только Backend)
