# API Reference

**Статус:** Partially current  
**Дата обновления:** 2026-05-29  
**Источник правды:** `server/index.ts`, `server/routes.ts`, `server/routes/*`, `shared/schema.ts`.

## Назначение

Этот файл — обзорная карта API. Полные схемы запросов/ответов пока не генерируются автоматически, поэтому для точной формы payload нужно сверяться с соответствующим route file и типами в `shared/schema.ts`.

## Базовые URL

Локально сервер обычно доступен на порту, заданном переменными окружения/сервером. Клиентский dev server запускается на `3000`.

Типовые API prefixes:

- `/api/*` — основная группа API;
- `/api/v1/*` — часть legacy/v1 endpoints;
- `/api/auth/*` — аутентификация.

## Аутентификация

Поддерживаются два способа передачи access token:

```http
Authorization: Bearer <token>
Cookie: accessToken=<token>
```

`optionalJwtAuth` проверяет оба способа и допускает отсутствие токена. Защищённые routes используют `jwtAuth`; часть доменов дополнительно требует `requireActiveUser`.

## Current API map

Сводная карта mount points находится в [routes.md](routes.md). Основные домены:

- Auth: `/api/auth`;
- Admin: `/api/v1/admin`, `/api/admin/gamification`;
- Clubs: `/api/clubs`, `/api/v1` club books/access, `/api` discussions;
- Personal books/reader: `/api/v1/user/books`, `/api/v1/books`;
- Reading sessions: `/api/reading-sessions`, `/api/reactions`, `/api/questions`, `/api/schedule`, `/api/recordings`, `/api/session-analytics`, `/api/reader-quality`;
- Notifications: `/api/notifications`;
- Social/feed/DM: `/api/social`, `/api/feed`, `/api/users`, `/api/presence`, `/api/dm`;
- Recommendations: `/api/recommendations`;
- Gamification: `/api/gamification`, `/api/admin/gamification`;
- Guest: `/api/v1/guest`;
- Feedback: `/api/v1/feedback`;
- Studio stream: `/api/studio/stream`.

## Формат ошибок

Единого глобального envelope для всех legacy/current endpoints нет. Часть routes возвращает `{ success, error }`, часть — `{ message }` или доменный объект. При документировании конкретного endpoint используйте фактический код route handler.

## Known gaps

- Нет OpenAPI-файла как machine-readable source of truth.
- Не все endpoints имеют синхронизированные примеры request/response.
- Для enterprise-интеграций рекомендуется подготовить отдельную OpenAPI-спецификацию и contract tests.
