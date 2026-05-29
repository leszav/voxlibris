# Аудит документации VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-05-29  
**Основано на коде:** `package.json`, `AGENTS.md`, `server/index.ts`, `server/routes.ts`, `server/repositories/`, `server/services/`, `shared/schema.ts`, `migrations/`, `email-templates/`.

## Цель

Этот документ фиксирует расхождения между документацией и фактическим состоянием репозитория. Все новые или обновлённые разделы должны явно отделять:

- **Current** — подтверждено файлами и командами в репозитории;
- **Partially current** — основа актуальна, но есть устаревшие примеры или неполное покрытие;
- **Roadmap** — планируемая функциональность, не подтверждённая текущими зависимостями/файлами;
- **Legacy / Reference** — исторический контекст или справочные материалы, не являющиеся текущим baseline.

## Ключевые выводы

| Область | Фактическое состояние | Исправление |
|---|---|---|
| Тестирование | В `package.json` есть только Node.js test runner: `pnpm test`, `test:watch`, `test:coverage`. Vitest, Playwright, Supertest, MSW отсутствуют. | `docs/10-testing/README.md` переписан под текущий стек; Vitest/Playwright вынесены в roadmap. |
| Email | Используется `nodemailer` и HTML-шаблоны из `email-templates/`. `resend` и `react-email` в зависимостях отсутствуют. | README и email/notification docs обновлены. |
| Уведомления | Есть `server/services/email-service.ts`, `server/services/notification-service.ts`, `server/routes/notifications.ts`, scheduler и таблицы уведомлений. Push-уведомления как браузерный push не подтверждены. | Раздел уведомлений уточняет current baseline и known gaps. |
| Миграции/deploy | `AGENTS.md` задаёт production-процесс: миграции вручную, строго по одной через pgAdmin на CapRover. В docs были команды `db:push`/`drizzle-kit migrate` как production-шаг. | Deployment docs обновлены: dev и prod процессы разделены. |
| API | Реальные маршруты монтируются в `server/index.ts` и `server/routes.ts`, а не через `server/routes/index.ts`. | `docs/05-server/routes.md` и `api-reference.md` обновлены как карта фактических mount points. |
| Архитектура | Реализованы social graph, feed, DM, recommendations, gamification, Studio/Icecast baseline, reader core/adapters. | Обновлены архитектурные overview/application docs. |
| Analytics/monitoring | Есть `server/analytics`, `server/analytics-routes.ts`, `server/routes/session-analytics.ts`, `server/services/session-analytics-service.ts`; полноценный observability stack не найден. | Зафиксировано как partially current / known gap. |
| Studio audio | Текущий baseline — Icecast/streaming route и live proxy; WebRTC/mediasoup относится к roadmap/reference. | Отражено в архитектурных документах и навигации. |

## Инвентаризация документов

| Путь | Тема | Статус | Связанный код | Проблема | Действие |
|---|---|---|---|---|---|
| `README.md` | Главный обзор и запуск | Current | `package.json`, `.env.example`, `docker-compose.yml` | Упоминал Resend/React Email; быстрый старт содержал `db:seed` вместо `seed`; Redis не поднимается в `dev:services`. | Обновлён. |
| `docs/README.md` | Навигация | Current | `docs/` | Не было статусов и audit entry. | Обновлён. |
| `docs/SUMMARY.md` | Навигация | Current | `docs/` | Не отражал audit/current/roadmap разделение. | Обновлён. |
| `docs/02-architecture/overview.md` | Архитектурный обзор | Current | `server/index.ts`, `server/repositories/index.ts`, `client/src`, `shared/schema.ts` | Не отражал новые домены и Studio/Icecast baseline. | Обновлён. |
| `docs/02-architecture/application-architecture.md` | Архитектура приложения | Current | `server/`, `client/src/`, `migrations/` | Содержал абсолютные ссылки и неточные утверждения о real-time latency. | Обновлён. |
| `docs/02-architecture/notification-system.md` | Уведомления/email | Current | `server/services/email-service.ts`, `server/services/notification-service.ts`, `server/routes/notifications.ts`, `email-templates/` | Push и каналы были описаны как реализованные без подтверждения. | Обновлён. |
| `docs/02-architecture/analytics-system.md` | Аналитика | Partially current | `server/analytics/`, `server/analytics-routes.ts`, `server/routes/session-analytics.ts` | Требует дальнейшей детализации событий и метрик. | Зафиксировано как follow-up. |
| `docs/05-server/routes.md` | Маршруты | Current | `server/index.ts`, `server/routes.ts` | Описывал несуществующий `server/routes/index.ts` и неверные имена файлов. | Обновлён. |
| `docs/05-server/api-reference.md` | API reference | Partially current | `server/index.ts`, `server/routes.ts`, `server/routes/*` | Полные схемы запросов/ответов требуют отдельной генерации/ручной сверки по каждому route. | Обновлена карта mount points и правила аутентификации. |
| `docs/10-testing/README.md` | Тестирование | Current | `package.json`, `server/__tests__/` | Документировал отсутствующий стек Vitest/Playwright/Supertest/MSW. | Обновлён. |
| `docs/11-deployment/deployment-guide.md` | Deployment/migrations | Current | `AGENTS.md`, `Dockerfile`, `package.json`, `docker-compose*.yml` | Production migration flow конфликтовал с `AGENTS.md`. | Обновлён. |
| `docs/06-database/migrations.md` | Миграции | Partially current | `migrations/*.sql`, `AGENTS.md` | Нужно привести полностью к ручному production-процессу. | Follow-up. |
| `docs/08-email-templates/*` | HTML-шаблоны | Partially current | `email-templates/*.html`, `server/services/email-service.ts` | Нужно явно указать Nodemailer/HTML, не React Email. | Follow-up. |
| `docs/vlstudio/*` | Studio roadmap/reference | Partially current | `server/lib/icecast-*`, `server/routes/studio-stream.ts`, `server/audio/` | Часть документов — roadmap/historical context. | Навигация помечает раздел как смешанный current/reference. |
| `docs/12-admin-manual/*` | Эксплуатация/admin | Partially current | `server/admin-routes.ts`, `server/admin-*` | Требует отдельной сверки всех admin endpoints. | Follow-up. |

## Unresolved questions для команды

1. Нужен ли официальный переход на Vitest/Playwright, или текущий Node.js test runner остаётся целевым baseline?
2. Требуется ли подключать браузерные push-уведомления и хранение push subscriptions, или `pushEnabled` пока только задел в настройках?
3. Какой production SMTP-провайдер считается стандартным для enterprise-инсталляций?
4. Нужно ли автоматизировать проверку миграций локально, не меняя production-процесс ручного применения через pgAdmin?
5. Должна ли API-документация стать OpenAPI-спецификацией, чтобы исключить ручное расхождение с routes?
6. Какой уровень observability обязателен для enterprise: structured logs достаточно или нужен Prometheus/Grafana/Sentry/трейсинг?
7. WebRTC/mediasoup для Studio остаётся roadmap или планируется возврат в ближайший sprint?

## Changelog обновления документации

- Уточнён главный README: фактические команды, стек, email, тесты, миграции.
- Добавлен этот аудит документации.
- Обновлена навигация `docs/README.md` и `docs/SUMMARY.md`.
- Обновлены архитектурные overview/application/notification docs.
- Обновлены server routes/API reference как проверяемая карта mount points.
- Обновлён testing README под Node.js test runner.
- Обновлён deployment guide с разделением dev/prod миграций.
