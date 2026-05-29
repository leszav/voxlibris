# Система уведомлений и почты

**Статус:** Current  
**Дата обновления:** 2026-05-29

## Current baseline

Система состоит из email-отправки через `nodemailer`, внутренних уведомлений в БД и API для пользовательской «колокольчик»-ленты/настроек.

Ключевые файлы:

- `server/services/email-service.ts` — SMTP/Nodemailer, рендеринг HTML-шаблонов;
- `email-templates/*.html` — готовые HTML-шаблоны писем;
- `server/services/notification-service.ts` — создание и настройки уведомлений;
- `server/routes/notifications.ts` — API уведомлений;
- `server/services/scheduler.ts` — фоновые напоминания/планировщик;
- `shared/schema.ts` и миграции — таблицы уведомлений и настроек.

## Email

Текущий email baseline — `nodemailer`. В `package.json` нет `resend` и `react-email`, поэтому они не должны упоминаться как используемые технологии.

Типовые сценарии email:

- подтверждение регистрации;
- восстановление пароля;
- приглашения в клубы;
- модерационные уведомления;
- feedback/admin notifications;
- SMTP test шаблон.

Шаблоны находятся в `email-templates/` и являются обычными HTML-файлами.

## Internal notifications

`server/routes/notifications.ts` предоставляет endpoints для:

- чтения настроек пользователя;
- обновления настроек;
- получения сгруппированных/непрочитанных уведомлений;
- отметки уведомлений прочитанными;
- создания/обработки доменных уведомлений через сервисный слой.

Точный список endpoint лучше сверять непосредственно с `server/routes/notifications.ts`, так как route file является source of truth.

## Channels: current vs roadmap

| Канал | Статус | Комментарий |
|---|---|---|
| Email | Current | `nodemailer` + SMTP + HTML templates. |
| In-app notifications | Current | Хранятся в PostgreSQL и выдаются через `/api/notifications`. |
| Socket.IO realtime events | Partially current | Используется для отдельных доменных событий, например feed/DM. |
| Browser push | Roadmap | Настройки вроде `pushEnabled` есть, но полноценный Web Push baseline не подтверждён зависимостями/файлами. |

## Known gaps

- Нет подтверждённого production push provider/Web Push flow.
- Нет отдельной очереди писем; отправка зависит от текущей реализации `email-service`.
- Для enterprise требуется определить bounce handling, rate limits SMTP-провайдера и audit trail доставки.
