# Архитектура приложения VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-05-29

## Краткое описание

VoxLibris — SPA на React и API-сервер на Express. Общие схемы и типы лежат в `shared/schema.ts`, данные хранятся в PostgreSQL, файлы — в S3-совместимом хранилище/MinIO.

## Структура репозитория

```text
client/             React/Vite frontend
server/             Express API, Socket.IO, services, repositories
shared/             Drizzle schema и общие типы
migrations/         SQL-миграции PostgreSQL
email-templates/    HTML-шаблоны писем для nodemailer
docs/               Документация
script/, scripts/   Утилиты разработки/сборки
```

## Server composition

- `server/index.ts` создаёт Express app, HTTP server и Socket.IO, настраивает CORS, helmet, rate limiting, cookie parser, compression и mount points.
- `server/routes.ts` регистрирует legacy/core routes и часть Studio routes.
- `server/routes/*` содержит доменные роутеры для новых модулей.
- `server/services/*` содержит бизнес-сервисы: email, notifications, scheduler, activity, gamification, analytics.
- `server/repositories/*` инкапсулирует доступ к БД.

## Client composition

Клиент расположен в `client/src` и использует React 19, Vite, Tailwind CSS, Radix UI и TanStack React Query. Для точной карты компонентов и страниц сверяйтесь с `docs/07-client/*` и фактической структурой `client/src`.

## Data flow

1. Клиент вызывает REST API или подключается к Socket.IO.
2. Middleware проверяет CORS, rate limits, JWT/cookie auth и активность пользователя.
3. Route вызывает сервис или репозиторий.
4. Репозиторий работает с PostgreSQL через Drizzle schema из `shared/schema.ts`.
5. Для realtime-событий сервисы используют Socket.IO через `server/lib/socket-registry.ts`.

## Production/runtime notes

- Production deploy — Docker/CapRover.
- Миграции production применяются вручную через pgAdmin, по одной.
- Email — `nodemailer`; Resend/React Email не являются текущими зависимостями.
- Studio audio current baseline — Icecast/streaming; WebRTC/mediasoup — roadmap/reference.
