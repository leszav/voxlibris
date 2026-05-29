# VoxLibris

**Статус документа:** Current  
**Дата обновления:** 2026-05-29

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

Перед первым запуском проверьте `.env.example`. Для локальной БД в правилах проекта используется PostgreSQL `postgresql://xlibris:xlibris_dev@localhost:5432/xlibris`.

## Что реализовано сейчас

- Книжные клубы, участники, приглашения, роли и модерация.
- Личная и клубная библиотека, загрузка EPUB/FB2, обложки и S3/MinIO-хранилище.
- Reader core/adapters и синхронизация статуса чтения.
- Reading sessions, реакции, вопросы, расписание и записи.
- VoxLibris Studio baseline на Icecast/streaming route; WebRTC/mediasoup — roadmap/reference.
- Социальный граф, activity feed, presence и direct messages.
- Рекомендации и геймификация.
- Административные маршруты и feature flags.
- Email через `nodemailer` и HTML-шаблоны из `email-templates/`.

## Технологический стек

- TypeScript, Node.js 20+, pnpm 9.
- React 19, Vite, Tailwind CSS, Radix UI, TanStack React Query.
- Express 5, Socket.IO, cookie-parser, helmet, express-rate-limit, express-slow-down.
- PostgreSQL, Drizzle ORM, SQL-миграции в `migrations/`.
- Redis для rate limiting там, где настроен.
- S3-совместимое хранилище/MinIO для файлов.
- `nodemailer` для email.
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
