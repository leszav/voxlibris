<div align="center">

# VoxLibris

![VoxLibris](./client/public/og-image.webp)

**Платформа социального чтения: книжные клубы, совместное чтение, live/audio-сессии, рекомендации и геймификация.**

[![License](https://img.shields.io/badge/license-proprietary-red)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-f69220)](https://pnpm.io/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)

</div>

---

## Оглавление

- [О проекте](#о-проекте)
- [Возможности](#возможности)
- [Технологический стек](#технологический-стек)
- [Быстрый старт](#быстрый-старт)
- [Структура проекта](#структура-проекта)
- [Доступные команды](#доступные-команды)
- [Тестирование](#тестирование)
- [Документация](#документация)
- [Лицензия](#лицензия)

## О проекте

VoxLibris — платформа социального чтения, объединяющая книжные клубы, совместное чтение, live и audio-сессии (VoxLibris Studio), рекомендации, геймификацию и административные инструменты в единой экосистеме.

## Возможности

| Область | Описание |
|---------|----------|
| **Книжные клубы** | Участники, приглашения, роли, модерация и тарифные шаблоны |
| **Библиотека** | Личная и клубная, загрузка EPUB/FB2, обложки, S3/MinIO-хранилище |
| **Чтение** | Reader core/adapters, синхронизация статуса чтения |
| **Reading sessions** | Реакции, вопросы, расписание, записи, эмоциональная карта эфиров |
| **VoxLibris Studio** | Baseline на Icecast/streaming; WebRTC/mediasoup — roadmap |
| **Социальный граф** | Activity feed, presence, direct messages |
| **Рекомендации** | Персонализированные рекомендации книг и клубов |
| **Геймификация** | Баллы, достижения, рейтинги |
| **Уведомления** | Web Push (self-hosted, VAPID), in-app уведомления |
| **Монетизация** | Freemium-лимиты, YooKassa checkout/webhooks, конструктор тарифов |
| **Админка** | Feature flags, управление подписками, аудит, email-шаблоны |

## Технологический стек

| Слой | Технологии |
|------|-----------|
| **Frontend** | React 19, Vite, Tailwind CSS, Radix UI, TanStack React Query |
| **Backend** | Express 5, Socket.IO, helmet, rate-limit |
| **База данных** | PostgreSQL, Drizzle ORM, SQL-миграции |
| **Хранилище** | S3-совместимое / MinIO |
| **Кэш** | Redis (rate limiting) |
| **Email** | nodemailer + HTML-шаблоны |
| **Push** | web-push (VAPID), service worker |
| **Язык** | TypeScript, Node.js 20+ |
| **Пакетный менеджер** | pnpm 9 |

## Быстрый старт

### Предварительные требования

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 8
- [Docker](https://www.docker.com/) и Docker Compose

### Установка и запуск

```bash
# Клонируйте репозиторий
git clone <repository-url>
cd voxlibris

# Установите зависимости
pnpm install

# Настройте переменные окружения
cp .env.example .env
# Отредактируйте .env — укажите DATABASE_URL и другие переменные

# Запустите сервисы (PostgreSQL, MinIO)
pnpm run dev:services

# Инициализируйте хранилище
pnpm run init-storage

# Запустите приложение (клиент + сервер)
pnpm dev
```

После запуска клиент доступен на `http://localhost:3000`, сервер — на `http://localhost:5000`.

### Переменные окружения

Скопируйте `.env.example` в `.env` и заполните обязательные переменные:

| Переменная | Описание |
|-----------|----------|
| `DATABASE_URL` | Строка подключения к PostgreSQL |
| `VAPID_EMAIL` | Email для VAPID-ключей (Web Push) |
| `VAPID_PUBLIC_KEY` | Публичный VAPID-ключ |
| `VAPID_PRIVATE_KEY` | Приватный VAPID-ключ |

VAPID-ключи генерируются командой:

```bash
pnpm exec web-push generate-vapid-keys
```

## Структура проекта

```text
client/              # React frontend (Vite, Tailwind, Radix/shadcn)
server/              # Express API, сервисы, маршруты, Socket.IO
shared/              # Общие типы, схемы и утилиты
migrations/          # SQL-миграции PostgreSQL (применяются вручную)
docs/                # Архитектурная и эксплуатационная документация
email-templates/     # HTML-шаблоны email-уведомлений
script/, scripts/    # Вспомогательные скрипты
uploads/             # Локальные загруженные файлы (dev)
```

## Доступные команды

| Команда | Описание |
|---------|----------|
| `pnpm dev` | Полный запуск dev-окружения (клиент + сервер + сервисы) |
| `pnpm run dev:client` | Только Vite dev server (порт 3000) |
| `pnpm run dev:server` | Только Express server через tsx |
| `pnpm run dev:services` | PostgreSQL и MinIO через Docker Compose |
| `pnpm run build` | Production-сборка |
| `pnpm start` | Запуск production-сборки |
| `pnpm run quality:gate` | TypeScript + ESLint + production build |
| `pnpm run db:migrate` | Применение миграций (dev) |
| `pnpm run db:push` | Push схемы в БД (dev) |

## Тестирование

```bash
pnpm test                    # Все тесты
pnpm test:watch              # Watch-режим
pnpm test:coverage           # С покрытием
pnpm run test:integration    # Интеграционные HTTP-тесты
pnpm run quality:gate        # Полная проверка качества
```

Тесты расположены в `server/__tests__/` и запускаются через `node --test --experimental-strip-types`.

Интеграционные тесты находятся в `server/__tests__/integration/` и требуют запущенного API-сервера (`TEST_API_BASE_URL`, по умолчанию `http://127.0.0.1:5000`).

> При полном прогоне HTTP-интеграций может потребоваться задержка между запросами для избежания rate limit:
> ```bash
> TEST_API_REQUEST_DELAY_MS=2500 pnpm run test
> ```

## Документация

| Документ | Описание |
|----------|----------|
| [Центр документации](./docs/README.md) | Точка входа в документацию |
| [Аудит документации](./docs/DOCUMENTATION_AUDIT.md) | Актуальность документов |
| [Архитектура](./docs/02-architecture/README.md) | Общая архитектура системы |
| [Клубы чтецов](./docs/02-architecture/reader-clubs-system.md) | Система книжных клубов |
| [API и маршруты](./docs/05-server/routes.md) | Справочник API |
| [База данных](./docs/06-database/README.md) | Схема и миграции |
| [Тестирование](./docs/10-testing/README.md) | Стратегия и инфраструктура тестов |
| [Деплой](./docs/11-deployment/deployment-guide.md) | Руководство по развёртыванию |
| [VoxLibris Studio](./docs/vlstudio/README.md) | Аудио/видео-сессии |

## Лицензия

Репозиторий VoxLibris Platform распространяется на **проприетарной основе** и не является open-source.

Допускается только просмотр и оценка содержимого. Любое использование, копирование, модификация или распространение допускаются исключительно с предварительного письменного разрешения правообладателя.

Подробные условия: [LICENSE](./LICENSE).
