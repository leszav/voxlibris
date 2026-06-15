# API integration coverage

**Статус:** Current  
**Дата обновления:** 2026-06-15  
**Источник правды:** `server/__tests__/integration/`, `package.json`.

## Цель слоя

Интеграционные API-тесты закрывают замечание о том, что большой набор HTTP-маршрутов нельзя надёжно проверять вручную. В хакатонной итерации цель — не формальный 100% coverage всех эндпоинтов, а воспроизводимая проверка критических HTTP-контрактов и границ доступа.

Тесты запускаются поверх реального Express API через `fetch`, без Supertest/Vitest/Playwright и без новых зависимостей.

## Запуск

В отдельном терминале поднимите backend и необходимые сервисы:

```bash
pnpm run dev:services
pnpm run init-storage
pnpm run dev:server
```

Затем запустите интеграционный набор:

```bash
pnpm run test:integration
```

По умолчанию тесты обращаются к `http://127.0.0.1:5000`. Для другого адреса используйте:

```bash
TEST_API_BASE_URL=http://127.0.0.1:5000 pnpm run test:integration
```

Чтобы smoke-набор не упирался в локальный rate limiting, между HTTP-запросами по умолчанию есть пауза `800ms`. Её можно изменить:

```bash
TEST_API_REQUEST_DELAY_MS=1200 pnpm run test:integration
```

Если API недоступен, тесты аккуратно пропускаются с сообщением. Это сделано намеренно, чтобы обычная проверка репозитория не падала в окружении без поднятой БД/server runtime.

## Что покрыто сейчас

Текущий интеграционный слой содержит 22 HTTP-проверки:

### Public API smoke

- `GET /api/health` — backend отвечает health-check JSON.
- `GET /api/books` — публичный список книг отдаётся как JSON-массив.
- `GET /api/books/search` без `q` — серверная валидация возвращает `400`.
- `GET /api/search/global?q=a` — короткий запрос не вызывает `500`, возвращает пустые группы.
- `GET /api/clubs/catalog?limit=5` — публичный каталог клубов отдаётся массивом.
- `GET /api/clubs/landing-reader-clubs/status` — публичный feature flag возвращает boolean.
- `GET /api/presence/club/:clubId` — presence endpoint возвращает список online user ids.
- `GET /api/users/search?q=a` — короткий поисковый запрос валидируется как `400`.
- `GET /api/books/:id` для отсутствующей книги — возвращает `404`, а не `500`.

### Auth and access boundaries

- `GET /api/auth/me` без токена — `401` и код `NO_TOKEN`.
- `GET /api/clubs` без токена — `401`.
- `GET /api/user/clubs` без токена — `401`.
- `GET /api/user/books` без токена — `401`.
- `POST /api/books` без токена — `401`.
- `POST /api/auth/login` без email/username — `400` или защитный `429` от auth rate limiter.
- `POST /api/auth/register` с некорректным email — `400` или защитный `429` от auth rate limiter.
- `POST /api/auth/forgot-password` с пустым body — `400` или защитный `429` от auth rate limiter.
- `POST /api/auth/reset-password` с пустым body — `400` или защитный `429` от auth rate limiter.
- `POST /api/auth/refresh` без cookie — `401`.
- `POST /api/auth/logout` без cookie — безопасный `200`.
- `POST /api/v1/feedback` с невалидными данными — `400` до отправки email.
- `POST /api/v1/guest/restore` с плохим кодом — валидируемая ошибка или защитный `429`, без `500`.

## Почему это не все 213 эндпоинтов

Покрытие всех маршрутов — отдельная большая задача. Для первичной оценки готовности важнее проверить:

1. что API действительно поднимается и отвечает JSON;
2. что публичные endpoints не падают на базовых запросах;
3. что защищённые endpoints закрыты без JWT;
4. что базовая валидация и защита входных данных возвращают контролируемые `400/401/404/429`, а не `500`;
5. что тестовый слой можно расширять без смены стека.

## Следующие кандидаты на покрытие

Рекомендуемый порядок расширения:

1. Auth happy path на отдельной тестовой БД: регистрация → подтверждение/активация → login → `/api/auth/me`.
2. Books happy path для администратора/владельца: создание книги → добавление контента → чтение → обновление → удаление.
3. Club happy path: создание клуба → приглашение → принятие → проверка membership.
4. Reader-club security: слушатель не получает текст книги через прямой API-запрос.
5. Reading sessions: создание → старт → реакции/вопросы → завершение.
6. WebSocket smoke для Socket.IO namespaces.

Для happy path тестов нужна контролируемая тестовая БД/fixtures, чтобы тесты не зависели от production/dev данных.
