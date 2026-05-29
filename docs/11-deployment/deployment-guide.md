# Руководство по развертыванию

**Статус:** Current  
**Дата обновления:** 2026-05-29  
**Источник правды:** `AGENTS.md`, `package.json`, `Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`, `migrations/`.

## Production baseline

Текущий production-процесс проекта: Docker → CapRover. Сервер запускается командой из Docker image без автоматического применения миграций:

```text
node dist/server/index.js
```

Критически важно: production-миграции применяются вручную, строго по одной, через pgAdmin на сервере CapRover. Это правило зафиксировано в `../AGENTS.md` и имеет приоритет над общими рекомендациями Drizzle.

## Локальная разработка

```bash
pnpm install
cp .env.example .env
pnpm run dev:services
pnpm run init-storage
pnpm dev
```

Фактические dev-команды:

```bash
pnpm run dev:client    # Vite, порт 3000
pnpm run dev:server    # tsx server/index.ts с загрузкой server/env.ts
pnpm run dev:services  # docker compose up postgres minio -d
pnpm run dev           # kill ports, services, storage init, server + client
pnpm run dev:stop      # docker compose down
```

Redis используется сервером для rate limiting, если доступен/настроен через переменные окружения. Проверьте `docker-compose.yml` и `.env.example` перед запуском в конкретном окружении.

## Сборка и запуск

```bash
pnpm run build
pnpm start
```

Проверки перед релизом:

```bash
pnpm test
pnpm run quality:gate
```

`quality:gate` выполняет TypeScript check, ESLint и build.

## Миграции базы данных

### Dev

В dev допустимо использовать команды Drizzle для локальной базы, если это не противоречит текущей задаче:

```bash
pnpm run db:migrate
pnpm run db:push
```

Но эти команды не описывают production-процесс и не должны автоматически выполняться при деплое.

### Production

Production-порядок:

1. Проверить последний номер миграции:
   ```bash
   ls migrations/ | sort | tail -5
   ```
2. Убедиться, что новые файлы идут строго без пропусков: `0042`, `0043`, `0044` и т.д.
3. Проверить идемпотентность SQL:
   - `CREATE TABLE IF NOT EXISTS`;
   - `ADD COLUMN IF NOT EXISTS`;
   - `CREATE INDEX IF NOT EXISTS`;
   - `CREATE TYPE` через `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`.
4. Применить миграцию локально.
5. Повторно применить ту же миграцию локально и убедиться, что нет ошибок.
6. Применить на production через pgAdmin вручную, по одному файлу, в правильном порядке.
7. Зафиксировать результат применения в release notes/операционном журнале.

### Начальные данные (seed_data.sql)

Перед применением `migrations/seed_data.sql`:

1. Откройте файл и найдите секцию с шаблоном admin-пользователя
2. Замените `YOUR_EMAIL` на реальный email администратора
3. Сгенерируйте bcrypt-хеш пароля:
   ```bash
   node -e "console.log(require('bcrypt').hashSync('YOUR_PASSWORD', 10))"
   ```
4. Замените `YOUR_BCRYPT_HASH` на полученный хеш
5. Примените миграцию через pgAdmin

**Важно:** Никогда не коммитьте файл с реальными credentials в git.

Запрещено без отдельного согласования:

- `DROP`;
- `TRUNCATE`;
- destructive `ALTER COLUMN TYPE`;
- автоматический запуск миграций при старте контейнера.

## Переменные окружения

Минимальные группы переменных смотрите в `.env.example`:

- `DATABASE_URL` — PostgreSQL;
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — auth;
- `ALLOWED_ORIGINS` — CORS/Socket.IO;
- S3/MinIO переменные для файлов;
- SMTP-переменные для `nodemailer`;
- Redis/rate-limit настройки;
- публичные URL для ссылок и Icecast/Studio, если используются.

## Email

Текущая реализация использует `nodemailer` и HTML-шаблоны из `email-templates/`. Зависимости `resend` и `react-email` не входят в текущий baseline.

## Studio audio baseline

Текущий production baseline для Studio связан с Icecast/streaming route и файлами:

- `server/routes/studio-stream.ts`;
- `server/lib/icecast-live-proxy.ts`;
- `server/lib/studio-streaming-service.ts`;
- `docs/vlstudio/VLSTUDIO_ICECAST_BASELINE_2026-04-28.md`.

WebRTC/mediasoup следует считать roadmap/reference, если в конкретном релизе не указано обратное.

## Production readiness / Known gaps

- Миграции production выполняются вручную; это снижает риск неконтролируемых изменений, но требует дисциплины и операционного журнала.
- Тестовое покрытие ограничено Node.js test runner тестами в `server/__tests__/`.
- Полноценный observability stack не зафиксирован в зависимостях: есть structured logging (`pino`) и analytics modules, но нет подтверждённого Prometheus/Grafana/Sentry baseline.
- CI/CD нужно сверять отдельно по `.github/workflows/`; документация не должна предполагать автоматический deploy без проверки workflow.
- Security/compliance для enterprise требует отдельной оценки: хранение персональных данных, retention policy, audit log, backup/restore drill, SMTP/S3 provider compliance.
