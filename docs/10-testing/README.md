# Тестирование

**Статус:** Current  
**Дата обновления:** 2026-06-15  
**Источник правды:** `package.json`, `server/__tests__/`.

## Текущий baseline

Сейчас проект использует встроенный Node.js test runner. В репозитории не обнаружены зависимости Vitest, React Testing Library, Supertest, Playwright или MSW, поэтому они не являются текущим тестовым стеком.

Фактические команды из `package.json`:

```bash
pnpm test           # node --test --experimental-strip-types server/__tests__/**/*.test.ts
pnpm test:watch     # node --test --watch server/__tests__/**/*.test.ts
pnpm test:coverage  # node --test --experimental-test-coverage server/__tests__/**/*.test.ts
pnpm run test:integration # HTTP integration tests against a running API server
pnpm run check      # TypeScript check
pnpm run lint:eslint
pnpm run build
pnpm run quality:gate
```

## Где лежат тесты

```text
server/__tests__/
├── helpers/
│   └── api-client.ts
├── integration/
│   ├── auth-and-access.integration.test.ts
│   └── public-api.integration.test.ts
├── book-parser.test.ts
├── client-serializers.test.ts
├── security-upload.test.ts
└── validation.test.ts
```

Текущий набор покрывает серверные утилиты, сериализацию, безопасность upload flow, валидацию и отдельный слой HTTP integration tests для публичных API, auth/access boundaries, feedback и guest restore.

Подробная матрица интеграционного покрытия: [`api-integration-coverage.md`](./api-integration-coverage.md).

## Как запускать перед изменениями

Минимальная проверка для документационных изменений:

```bash
pnpm run check
```

Для изменений в серверной логике:

```bash
pnpm test
pnpm run test:integration
pnpm run check
```

Интеграционные тесты ожидают поднятый API server. По умолчанию используется `http://127.0.0.1:5000`; переопределить адрес можно через `TEST_API_BASE_URL`:

```bash
TEST_API_BASE_URL=http://127.0.0.1:5000 pnpm run test:integration
```

Чтобы локальный rate limiting не мешал smoke-набору, helper делает паузу между запросами. Дефолт — `800ms`, переопределение:

```bash
TEST_API_REQUEST_DELAY_MS=1200 pnpm run test:integration
```

Для изменений, затрагивающих сборку, shared-типы, Vite или server entrypoint:

```bash
pnpm run quality:gate
```

## Практика написания новых тестов

Новые unit/smoke тесты добавляйте в `server/__tests__/` с расширением `.test.ts` и используйте API `node:test` и `node:assert/strict`.

Новые HTTP integration tests добавляйте в `server/__tests__/integration/` с расширением `.integration.test.ts`. Для запросов используйте helper `server/__tests__/helpers/api-client.ts`, чтобы сохранять единый формат `TEST_API_BASE_URL`, JSON parsing и проверки статусов.

Пример:

```ts
import test from "node:test";
import assert from "node:assert/strict";

test("пример бизнес-правила", () => {
  assert.equal(2 + 2, 4);
});
```

Если тест импортирует TypeScript-файлы проекта, учитывайте, что основной запуск использует `--experimental-strip-types`.

## Что не является текущим baseline

Следующие инструменты могут быть полезны, но сейчас должны считаться roadmap, пока они не добавлены в `package.json` и конфигурацию проекта:

- Vitest;
- React Testing Library / jest-dom;
- Supertest;
- Playwright;
- MSW;
- testcontainers.

## Known gaps

- Нет настроенного e2e набора для критических пользовательских сценариев.
- Нет отдельного клиентского unit/component testing setup.
- Интеграционные API-тесты пока покрывают smoke/access/error boundaries, но не полный happy path с фикстурами тестовой БД.
- Не покрыты WebSocket сценарии и большинство admin/gamification/recommendations endpoints.

## Roadmap

Если команда решит расширять тестовую стратегию, рекомендуемый порядок:

1. Зафиксировать целевой runner: оставить Node.js test runner или перейти на Vitest.
2. Добавить API integration tests для auth, clubs, reading sessions, social/feed/DM.
3. Добавить smoke e2e для регистрации, входа, клуба, загрузки книги и чтения.
4. Включить тесты в CI quality gate.
