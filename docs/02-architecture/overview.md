# Общая архитектура

**Статус:** Current  
**Дата обновления:** 2026-05-29

## Baseline

VoxLibris — клиент-серверное приложение для социального чтения. Текущий baseline подтверждён структурой `client/`, `server/`, `shared/`, `migrations/` и командами в `package.json`.

## Слои

1. **Client (`client/src`)** — React 19, Vite, TypeScript, Tailwind CSS, Radix UI, TanStack React Query.
2. **HTTP API (`server/index.ts`, `server/routes.ts`, `server/routes/*`)** — Express 5, JSON API, upload endpoints, rate limiting.
3. **Realtime (`server/websocket*`, `server/lib/socket-registry.ts`)** — Socket.IO для чтения, чатов, DM и feed events.
4. **Business services (`server/services/`, `server/lib/`)** — email, notifications, scheduler, activity, gamification, Studio streaming helpers.
5. **Data access (`server/repositories/`)** — `RepositoryContainer`, domain repositories, Drizzle ORM.
6. **Shared contracts (`shared/schema.ts`)** — Drizzle schema, типы и insert/select contracts.
7. **Database migrations (`migrations/`)** — SQL-файлы с ручным production-применением.

## Ключевые домены

| Домен | Статус | Ключевые файлы |
|---|---|---|
| Auth/JWT/cookies | Current | `server/auth-routes.ts`, `server/auth-service.ts`, `server/jwt-middleware.ts` |
| Clubs/books/library | Current | `server/club-routes.ts`, `server/club-books-routes.ts`, `server/personal-books-routes.ts`, `server/repositories/*Book*` |
| Reader core/adapters | Current | `client/src`, `server/routes/reader.ts`, `server/club-reader-routes.ts`, `server/lib/sync-reading-status.ts` |
| Reading sessions | Current | `server/routes/reading-sessions.ts`, `server/websocket/reading-sessions.ts`, `server/repositories/ReadingRepository.ts` |
| Reactions/questions/schedule/recordings | Current | `server/routes/reactions.ts`, `questions.ts`, `schedule.ts`, `recordings.ts` |
| Social graph | Current | `server/routes/social.ts`, `server/repositories/SocialRepository.ts`, `migrations/0041_add_social_graph.sql` |
| Activity feed | Current | `server/routes/feed.ts`, `server/services/activity-service.ts`, `migrations/0042_add_activity_feed.sql` |
| Direct messages | Current | `server/routes/direct-messages.ts`, `server/websocket-dm.ts`, `server/repositories/DmRepository.ts`, `migrations/0043_add_direct_messages.sql` |
| Gamification | Current | `server/routes/gamification.ts`, `server/routes/gamification-admin.ts`, `server/services/gamification-service.ts`, `server/repositories/GamificationRepository.ts` |
| Recommendations | Current | `server/routes/recommendations.ts`, `migrations/0046_add_recommendations.sql` |
| Notifications/email | Current | `server/routes/notifications.ts`, `server/services/notification-service.ts`, `server/services/email-service.ts`, `email-templates/` |
| Analytics | Partially current | `server/analytics/`, `server/analytics-routes.ts`, `server/routes/session-analytics.ts`, `server/services/session-analytics-service.ts` |
| Studio audio | Current + Roadmap | Current: `server/routes/studio-stream.ts`, `server/lib/icecast-live-proxy.ts`; roadmap/reference: `docs/vlstudio/*WEBRTC*` материалы |

## Аутентификация

JWT проверяется в `server/jwt-middleware.ts`. Важный проектный паттерн: `optionalJwtAuth` проверяет и `Authorization`, и cookie `accessToken`. Для части доменов применяется `requireActiveUser`.

Socket.IO также пытается извлечь JWT из `socket.handshake.auth.token`, `Authorization` или cookie `accessToken` в `server/index.ts`.

## RepositoryContainer

`server/repositories/index.ts` содержит `RepositoryContainer` с ленивой инициализацией (`??=`). Это основной доступ к доменным репозиториям. Старый `storage` сохраняется как адаптер совместимости, поэтому часть кода всё ещё обращается к `storage`, но реализация делегирует операции репозиториям.

## Realtime

Глобальный Socket.IO instance регистрируется через `registerIO(io)` в `server/index.ts`; доступ из сервисов выполняется через `getIO()` из `server/lib/socket-registry.ts`.

## Studio: Current vs Roadmap

Текущий аудио-baseline — Icecast/streaming route. Документы по WebRTC/mediasoup нужно читать как roadmap/reference, если конкретный релиз не говорит обратного.

## Known gaps

- Observability stack не оформлен как отдельный production baseline.
- API reference пока остаётся ручной документацией, не OpenAPI source of truth.
- Тестовый baseline ограничен Node.js test runner и `server/__tests__/`.
