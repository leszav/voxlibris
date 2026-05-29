# Документация VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-05-29

Добро пожаловать в документацию VoxLibris — платформы социального чтения и книжных клубов.

## Как читать документацию

В каждом крупном разделе используется статус:

- **Current** — соответствует текущему коду;
- **Partially current** — применимо частично, требует точечной сверки;
- **Roadmap** — планируемое, не гарантировано в текущем build;
- **Legacy / Reference** — исторический или справочный материал.

Начните с:

1. [Аудит документации](DOCUMENTATION_AUDIT.md) — что было сверено и какие расхождения остаются.
2. [Быстрый старт](01-introduction/getting-started.md) и [README проекта](../README.md).
3. [Архитектурный обзор](02-architecture/overview.md).
4. [Маршруты API](05-server/routes.md).
5. [Тестирование](10-testing/README.md) и [деплой](11-deployment/deployment-guide.md).

## Навигация

- [Введение](01-introduction/README.md)
- [Архитектура](02-architecture/README.md)
  - [Общая архитектура](02-architecture/overview.md)
  - [Архитектура приложения](02-architecture/application-architecture.md)
  - [Система уведомлений и почты](02-architecture/notification-system.md)
  - [Аналитика](02-architecture/analytics-system.md)
- [Конфигурация](03-configuration/README.md)
- [Скрипты](04-scripts/README.md)
- [Серверная часть](05-server/README.md)
  - [Маршруты](05-server/routes.md)
  - [API Reference](05-server/api-reference.md)
- [База данных](06-database/README.md)
- [Клиентская часть](07-client/README.md)
- [Email-шаблоны](08-email-templates/README.md)
- [Shared](09-shared/README.md)
- [Тестирование](10-testing/README.md)
- [Деплой и эксплуатация](11-deployment/README.md)
- [Руководство администратора](12-admin-manual/README.md)
- [VoxLibris Studio](vlstudio/README.md)

## Важные operational notes

- Production-миграции применяются вручную через pgAdmin, по одной, в строгом порядке. См. [../AGENTS.md](../AGENTS.md).
- Текущий тестовый стек — Node.js test runner, не Vitest/Playwright.
- Email baseline — `nodemailer` + HTML-шаблоны, не Resend/React Email.
- Studio baseline — Icecast/streaming route; WebRTC/mediasoup относится к roadmap/reference.
