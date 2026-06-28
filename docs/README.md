# Документация VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-06-28  
**Версия:** 2.0

Добро пожаловать в документацию VoxLibris — платформы социального чтения и книжных клубов.

## Как читать документацию

В каждом крупном разделе используется статус:

- **Current** — соответствует текущему коду;
- **Partially current** — применимо частично, требует точечной сверки;
- **Roadmap** — планируемое, не гарантировано в текущем build;
- **Legacy / Reference** — исторический или справочный материал.

## Навигация

### Быстрый старт
- [Быстрый старт](01-introduction/getting-started.md)
- [Обзор проекта](01-introduction/overview.md)
- [Технологический стек](01-introduction/technologies.md)

### Архитектура
- [Архитектурный обзор](02-architecture/overview.md)
- [Архитектура приложения](02-architecture/application-architecture.md)
- [Система клубов чтецов](02-architecture/reader-clubs-system.md)
- [Система уведомлений и почты](02-architecture/notification-system.md)
- [Аналитика и мониторинг](02-architecture/analytics-system.md)
- [Аудио-система](02-architecture/audio-system.md)
- [ADR](02-architecture/adr/README.md)

### Функциональные модули
- [Безопасность](SECURITY.md) — аутентификация, rate limiting, CSP
- [Гостевая система](GUEST_SYSTEM.md) — анонимный доступ
- [Социальные функции](SOCIAL_FEATURES.md) — граф, лента, сообщения
- [Геймификация](GAMIFICATION.md) — достижения, XP, уровни
- [Монетизация](MONETIZATION.md) — тарифы, подписки, платежи
- [Тарифные ключи](TARIFF_KEYS.md) — права доступа и лимиты
- [Studio и аудио](STUDIO_AUDIO.md) — стриминг, записи, качество чтецов
- [WebSocket системы](WEBSOCKET_SYSTEMS.md) — real-time коммуникации

### Техническая документация
- [Конфигурация](03-configuration/README.md)
- [Скрипты](04-scripts/README.md)
- [Серверная часть](05-server/README.md)
  - [Маршруты](05-server/routes.md)
  - [API Reference](API_REFERENCE.md)
- [База данных](06-database/README.md)
  - [Схема данных](06-database/schema.md)
  - [Миграции](06-database/migrations.md)
- [Клиентская часть](07-client/README.md)
- [Email-шаблоны](08-email-templates/README.md)
- [Shared](09-shared/README.md)

### Эксплуатация
- [Тестирование](10-testing/README.md)
- [Деплой и эксплуатация](11-deployment/README.md)
  - [Deployment guide](11-deployment/deployment-guide.md)
  - [Docker](11-deployment/docker.md)
  - [Мониторинг](11-deployment/monitoring.md)
- [Руководство администратора](12-admin-manual/README.md)

### Дополнительно
- [VoxLibris Studio](vlstudio/README.md)
- [iCalendar интеграция](iCalendar/README.md)
- [Аудит документации](DOCUMENTATION_AUDIT.md)

## Важные operational notes

- Production-миграции применяются вручную через pgAdmin, по одной, в строгом порядке. См. [AGENTS.md](../AGENTS.md).
- Текущий тестовый стек — Node.js test runner, не Vitest/Playwright.
- Email baseline — `nodemailer` + HTML-шаблоны, не Resend/React Email.
- Studio baseline — Icecast/streaming route; WebRTC/mediasoup относится к roadmap/reference.

## Обновления

### v2.0 (2026-06-28)
- Добавлена документация по безопасности
- Добавлена документация по гостевой системе
- Добавлена документация по социальным функциям
- Добавлена документация по геймификации
- Добавлена документация по монетизации
- Добавлена документация по тарифным ключам
- Добавлена документация по Studio и аудио
- Добавлена документация по WebSocket системам
- Обновлён API Reference
- Удалены устаревшие документы

### v1.0 (2026-05-29)
- Первоначальная структура документации
- Аудит документации
- Обновление существующих разделов