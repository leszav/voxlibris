# Серверные маршруты

**Статус:** Current  
**Дата обновления:** 2026-05-29  
**Источник правды:** `server/index.ts`, `server/routes.ts`, `server/routes/*`.

## Важно

В проекте нет единого `server/routes/index.ts`. Маршруты монтируются в двух местах:

1. `server/index.ts` — основная настройка приложения, middleware и новые домены.
2. `server/routes.ts` — core/legacy routes, upload API и часть Studio endpoints.

## Mount points из `server/index.ts`

| Prefix | Auth | Файл | Назначение |
|---|---|---|---|
| `/api/auth` | mixed | `server/auth-routes.ts` | Регистрация, вход, refresh/logout, email confirmation, password reset. |
| `/api/v1/guest` | guest feature flag | `server/guest-routes.ts` | Guest mode. |
| `/api/debug` | dev only | `server/debug-routes.ts` | Debug endpoints, только не production. |
| `/api/v1/admin` | admin routes | `server/admin-routes.ts`, `server/admin-guest-routes.ts`, `server/admin-feature-flags.ts` | Админка и feature flags. |
| `/api/v1/analytics` | route-level | `server/analytics-routes.ts` | Analytics API. |
| `/api/clubs` | route-level/JWT | `server/club-routes.ts`, `server/club-reader-routes.ts` | Клубы и club reader routes. |
| `/api/v1/books` | `jwtAuth` | `server/routes/reader.ts` | Reader/book endpoints. |
| `/api/reading-sessions` | `jwtAuth` | `server/routes/reading-sessions.ts` | Live reading sessions. |
| `/api/reactions` | `jwtAuth` | `server/routes/reactions.ts` | Реакции в сессиях. |
| `/api/reading-status` | `jwtAuth` | `server/reading-status-routes.ts` | Статусы чтения. |
| `/api/questions` | `jwtAuth` | `server/routes/questions.ts` | Вопросы в сессиях. |
| `/api/schedule` | `jwtAuth` | `server/routes/schedule.ts` | Расписание. |
| `/api/v1/feedback` | public | `server/routes/feedback.ts` | Feedback endpoint. |
| `/api/social` | `jwtAuth`, `requireActiveUser` | `server/routes/social.ts` | Social graph. |
| `/api/feed` | `optionalJwtAuth` | `server/routes/feed.ts` | Activity feed; часть endpoints публичная/optional auth. |
| `/api/users` | optional/public | `server/routes/users.ts` | Поиск пользователей и публичные профили. |
| `/api/presence` | route-level | `server/routes/presence.ts` | Presence/online status. |
| `/api/dm` | `jwtAuth`, `requireActiveUser` | `server/routes/direct-messages.ts` | Direct messages. |
| `/api/recommendations` | `jwtAuth`, `requireActiveUser` | `server/routes/recommendations.ts` | Recommendations. |
| `/api/admin/gamification` | `jwtAuth` | `server/routes/gamification-admin.ts` | Конструктор геймификации. |
| `/api/gamification` | `jwtAuth`, `requireActiveUser` | `server/routes/gamification.ts` | Пользовательский API геймификации. |
| `/api/studio/stream` | route-level | `server/routes/studio-stream.ts` | Studio streaming ingest/control baseline. |

## Mount points из `server/routes.ts`

| Prefix | Auth | Файл | Назначение |
|---|---|---|---|
| `/api/v1/user/books` | route-level | `server/personal-books-routes.ts` | Личная библиотека. |
| `/api/v1/genres` | route-level | `server/genres-routes.ts` | Жанры. |
| `/api/v1` | route-level | `server/club-books-routes.ts`, `server/access-routes.ts` | Club books и access routes. |
| `/api` | route-level | `server/club-discussions-routes.ts` | Обсуждения клубов. |
| `/api/schedule` | `jwtAuth` | `server/routes/schedule.ts` | Дублирующий mount schedule из legacy registration; учитывать при изменениях. |
| `/api/notifications` | route-level/JWT внутри | `server/routes/notifications.ts` | In-app notifications/settings. |
| `/api/recordings` | route-level | `server/routes/recordings.ts` | Session recordings. |
| `/api/session-analytics` | route-level | `server/routes/session-analytics.ts` | Analytics по сессиям. |
| `/api/reader-quality` | route-level | `server/routes/reader-quality.ts` | Оценки качества чтецов. |

## Auth middleware

- `jwtAuth` — обязательная JWT-аутентификация.
- `optionalJwtAuth` — пытается прочитать JWT из `Authorization` и cookie `accessToken`, но не блокирует гостя.
- `requireActiveUser` — дополнительная проверка активного/подтверждённого пользователя.

## Как поддерживать этот документ

При добавлении нового route:

1. Найдите mount point в `server/index.ts` или `server/routes.ts`.
2. Укажите prefix, middleware, файл и назначение.
3. Если endpoint публичный, явно отметьте это.
4. Если функциональность roadmap, не смешивайте её с current API.
