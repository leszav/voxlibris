# VoxLibris

![VoxLibris](./client/public/og-image.webp)

**Статус документа:** Current  
**Дата обновления:** 2026-06-13

VoxLibris — платформа социального чтения: книжные клубы, совместное чтение, live/audio-сессии, ридеры, социальный граф, activity feed, direct messages, рекомендации, геймификация и административные инструменты.

## Быстрый старт для разработчика

```bash
pnpm install
cp .env.example .env
pnpm run dev:services
pnpm run init-storage
pnpm dev
```

Фактические команды берутся из `package.json`:

- `pnpm run dev:client` — Vite dev server на порту 3000;
- `pnpm run dev:server` — Express server через `tsx`;
- `pnpm run dev:services` — PostgreSQL и MinIO через Docker Compose;
- `pnpm run dev` — подготовка портов, сервисов, storage и запуск клиента/сервера;
- `pnpm test` — тесты через встроенный Node.js test runner;
- `pnpm run quality:gate` — TypeScript, ESLint и production build.

Перед первым запуском проверьте `.env.example` и настройте переменные окружения в `.env`, включая `DATABASE_URL` для PostgreSQL.

## Что реализовано сейчас

- Книжные клубы, участники, приглашения, роли и модерация.
- Личная и клубная библиотека, загрузка EPUB/FB2, обложки и S3/MinIO-хранилище.
- Reader core/adapters и синхронизация статуса чтения.
- Reading sessions, реакции, вопросы, расписание и записи.
- Эмоциональная карта эфиров: таймкод-реакции слушателей, live-индикатор для чтеца, карта реакции аудитории и highlights завершённой сессии.
- VoxLibris Studio baseline на Icecast/streaming route; WebRTC/mediasoup — roadmap/reference.
- Социальный граф, activity feed, presence и direct messages.
- Рекомендации, геймификация и Web Push-уведомления для браузера/PWA.
- Административные маршруты и feature flags.
- Email через `nodemailer` и HTML-шаблоны из `email-templates/`.

## Web Push-уведомления

В проекте реализованы self-hosted Web Push-уведомления без внешнего push-сервера приложения. Backend использует `web-push` и VAPID, а доставка выполняется через стандартные push endpoints браузеров.

Возможности:

- пользователь включает push в личном кабинете через переключатель **Push уведомления**;
- браузерная подписка сохраняется в `push_subscriptions`;
- настройки канала хранятся в `push_notification_settings`;
- отправки логируются в `push_notification_log`;
- service worker `client/public/sw.js` показывает системные уведомления браузера/PWA;
- администратор может отправить тестовый push выбранному пользователю из админки;
- успешный админский тест также создаёт in-app уведомление для колокольчика.

Для работы Web Push нужны переменные окружения:

```env
VAPID_EMAIL=support@example.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

Ключи VAPID генерируются специальной командой, это не произвольные строки:

```bash
pnpm exec web-push generate-vapid-keys
```

Для production требуется HTTPS. После смены VAPID-ключей пользователям может потребоваться выключить и снова включить push-уведомления, чтобы создать подписку с новым public key.

## Эмоциональная карта эфиров

В reading sessions реализован первый production-level слой эмоциональной карты:

- слушатели отправляют быстрые emoji-реакции с таймкодом прослушивания;
- реакции доставляются чтецу в live-режиме через существующий Socket.IO-контур `/reading-sessions`, с HTTP fallback для синхронизации;
- завершённые сессии получают эмоциональную карту по временным окнам и топ-моменты/highlights;
- карта кэшируется в PostgreSQL JSONB для завершённых сессий;
- в VoxLibris Studio отображается компактный live-индикатор реакций;
- в summary завершённого эфира доступна панель эмоциональной карты и highlights.

## Технологический стек

- TypeScript, Node.js 20+, pnpm 9.
- React 19, Vite, Tailwind CSS, Radix UI, TanStack React Query.
- Express 5, Socket.IO, cookie-parser, helmet, express-rate-limit, express-slow-down.
- PostgreSQL, Drizzle ORM, SQL-миграции в `migrations/`.
- Redis для rate limiting там, где настроен.
- S3-совместимое хранилище/MinIO для файлов.
- `nodemailer` для email.
- `web-push` для Web Push/PWA уведомлений.
- Node.js test runner для текущих тестов.

> В текущем `package.json` нет `resend`, `react-email`, Vitest, Playwright, Supertest или MSW. Они не считаются current baseline.

## Документация

- [Центр документации](./docs/README.md)
- [Аудит документации](./docs/DOCUMENTATION_AUDIT.md)
- [Архитектура](./docs/02-architecture/README.md)
- [API и маршруты](./docs/05-server/routes.md)
- [База данных и миграции](./docs/06-database/README.md)
- [Тестирование](./docs/10-testing/README.md)
- [Деплой](./docs/11-deployment/deployment-guide.md)
- [VoxLibris Studio](./docs/vlstudio/README.md)

## Миграции

Production-миграции применяются вручную, строго по одной, через pgAdmin на CapRover. Автоматического запуска миграций при деплое нет. Это осознанное решение для полного контроля за миграциями. Подробные правила см. в [AGENTS.md](./AGENTS.md) и [deployment guide](./docs/11-deployment/deployment-guide.md).

Для Web Push используется миграция `0047_add_push_notifications.sql`. Она идемпотентна: таблицы создаются через `CREATE TABLE IF NOT EXISTS`, индексы — через `CREATE INDEX IF NOT EXISTS`.

Для эмоциональной карты используется миграция `0048_add_emotional_map.sql`: она добавляет таймкоды реакций и JSONB-кэш эмоциональной карты завершённых reading sessions.

Для dev доступны команды Drizzle из `package.json`, но они не заменяют production-процесс:

```bash
pnpm run db:migrate
pnpm run db:push
```

## Тестирование

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm run quality:gate
```

Тесты находятся в `server/__tests__/` и запускаются через `node --test --experimental-strip-types`.

## Лицензия

Репозиторий VoxLibris Platform распространяется на проприетарной основе и не является open-source.

Допускается только просмотр и оценка содержимого репозитория. Любое использование, копирование, модификация, распространение или иная эксплуатация допускаются исключительно с предварительного письменного разрешения правообладателя.

Подробные условия указаны в [LICENSE](LICENSE).
