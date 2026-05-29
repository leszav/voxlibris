# Тестирование

**Статус:** Current  
**Дата обновления:** 2026-05-29  
**Источник правды:** `package.json`, `server/__tests__/`.

## Текущий baseline

Сейчас проект использует встроенный Node.js test runner. В репозитории не обнаружены зависимости Vitest, React Testing Library, Supertest, Playwright или MSW, поэтому они не являются текущим тестовым стеком.

Фактические команды из `package.json`:

```bash
pnpm test           # node --test --experimental-strip-types server/__tests__/**/*.test.ts
pnpm test:watch     # node --test --watch server/__tests__/**/*.test.ts
pnpm test:coverage  # node --test --experimental-test-coverage server/__tests__/**/*.test.ts
pnpm run check      # TypeScript check
pnpm run lint:eslint
pnpm run build
pnpm run quality:gate
```

## Где лежат тесты

```text
server/__tests__/
├── book-parser.test.ts
├── client-serializers.test.ts
├── security-upload.test.ts
└── validation.test.ts
```

Текущий набор покрывает серверные утилиты, сериализацию, безопасность upload flow и валидацию. Клиентские component/e2e тесты в текущем baseline не настроены.

## Как запускать перед изменениями

Минимальная проверка для документационных изменений:

```bash
pnpm run check
```

Для изменений в серверной логике:

```bash
pnpm test
pnpm run check
```

Для изменений, затрагивающих сборку, shared-типы, Vite или server entrypoint:

```bash
pnpm run quality:gate
```

## Практика написания новых тестов

Новые тесты добавляйте в `server/__tests__/` с расширением `.test.ts` и используйте API `node:test` и `node:assert/strict`.

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
- API-тесты через HTTP-клиент не оформлены как отдельный слой.
- Покрытие ограничено текущими файлами в `server/__tests__/`.

## Roadmap

Если команда решит расширять тестовую стратегию, рекомендуемый порядок:

1. Зафиксировать целевой runner: оставить Node.js test runner или перейти на Vitest.
2. Добавить API integration tests для auth, clubs, reading sessions, social/feed/DM.
3. Добавить smoke e2e для регистрации, входа, клуба, загрузки книги и чтения.
4. Включить тесты в CI quality gate.
