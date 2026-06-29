# План реализации демо-кошелька чтеца

**Статус:** Roadmap  
**Дата:** 2026-06-29

## Общий подход

Реализовать узкий вертикальный slice:

```text
DB migration -> repository/service -> API -> UI в клубе чтецов -> smoke/manual check
```

Сначала только demo-provider. Реальный payout-provider не добавлять в первом этапе.

## Этап 0. Подготовка

1. Проверить актуальный номер миграции:

   ```bash
   ls migrations/ | sort | tail -5
   ```

2. Для SQL-only просмотра дополнительно проверить только numbered SQL:

   ```bash
   rg --files migrations | rg '/[0-9].*\.sql$' | sort | tail -5
   ```

3. На 2026-06-29 последний numbered SQL в репозитории:

   ```text
   0056_commerce_entitlement_actions.sql
   ```

4. Следующая миграция для этого функционала должна быть `0057_...sql`, если к моменту реализации не появятся новые миграции.

## Этап 1. DB schema

Создать идемпотентную миграцию:

```text
migrations/0057_add_reader_wallet_demo_payouts.sql
```

Таблицы:

- `commerce_payout_requests`;
- `commerce_payout_request_entries`.

Обязательные требования:

- `CREATE TABLE IF NOT EXISTS`;
- `CREATE INDEX IF NOT EXISTS`;
- `CREATE UNIQUE INDEX IF NOT EXISTS`;
- без `DROP`, `TRUNCATE`, разрушительных `ALTER`;
- все статусы через `CHECK`, без PostgreSQL enum, чтобы проще расширять статусы.

Минимальные индексы:

```text
commerce_payout_requests_reader_status_idx
commerce_payout_requests_created_at_idx
commerce_payout_request_entries_request_idx
commerce_payout_request_entries_ledger_unique_idx
```

Локальная проверка миграции:

```bash
pnpm tsx script/run-all-migrations.ts
pnpm tsx script/run-all-migrations.ts
```

Ожидаемо: повторный запуск без ошибок, допустимы только `NOTICE`.

## Этап 2. Shared schema

Обновить `shared/schema.ts`:

- типы `CommercePayoutRequestStatus`;
- таблица `commercePayoutRequests`;
- таблица `commercePayoutRequestEntries`;
- select/insert types.

Не трогать legacy-таблицы `readerEarnings`, `listenerPayments`, `clubMonetization`.

## Этап 3. Repository/service

Добавить простую доменную логику в существующий commerce-контур.

Рекомендуемые файлы:

```text
server/repositories/CommerceRepository.ts
server/services/monetization.ts
```

Не создавать новый abstraction layer. Достаточно методов:

```text
getReaderWallet(userId)
createDemoReaderPayout(userId)
```

Правила `getReaderWallet`:

- читает `commerce_ledger_entries`;
- учитывает только `reader_earning`;
- исключает entries, связанные с payout request в статусах `requested`, `processing`, `demo_paid`, `paid`;
- возвращает balance, entries и payoutRequests.

Правила `createDemoReaderPayout`:

- работает в транзакции;
- выбирает доступные ledger entries текущего пользователя;
- если баланс 0, возвращает 409;
- создает payout request с `provider_code = 'demo'`;
- связывает выбранные entries;
- переводит заявку в `demo_paid`;
- не вызывает внешние API.

## Этап 4. API

Добавить endpoints в `server/routes/monetization.ts`:

```http
GET /api/commerce/me/reader-wallet
POST /api/commerce/me/reader-wallet/demo-withdraw
```

Validation:

- `jwtAuth`;
- body для `demo-withdraw`:

  ```json
  { "confirmDemo": true }
  ```

- если `confirmDemo !== true`, вернуть 400.

Ошибки:

| Код | Причина |
|---|---|
| 401 | нет JWT |
| 400 | demo confirmation missing |
| 409 | доступного баланса нет |
| 500 | неожиданная ошибка |

## Этап 5. UI

Минимальное место внедрения:

```text
client/src/pages/reader-club-details.tsx
```

Показать блок только если:

```text
isOwner === true
```

Минимальный UI:

- карточка "Демо-кошелек";
- доступный баланс;
- всего начислено;
- уже смоделировано к выводу;
- кнопка "Смоделировать вывод";
- список последних demo-заявок.

Текст:

```text
Демо-режим: реальные деньги не выводятся. Баланс рассчитан по ledger-начислениям от тестовых платежей.
```

После успешного demo-withdraw:

- invalidation query кошелька;
- toast "Демо-заявка обработана";
- показать сумму.

## Этап 6. Тесты

Минимальные unit/integration тесты:

```text
server/__tests__/reader-wallet-demo-payouts.test.ts
```

Проверить:

1. Пользователь видит только свой wallet.
2. Баланс считается по `reader_earning`.
3. `platform_fee` и `acquiring_fee` не попадают в баланс.
4. Demo-withdraw создает request и links.
5. Повторный demo-withdraw без новых начислений возвращает 409.
6. Чужие ledger entries не выводятся.

Если полноценный DB integration неудобен, сделать service-level тест с тестовым store. Не добавлять внешние зависимости.

## Этап 7. Проверки

После изменений:

```bash
pnpm run check
```

Для серверной логики:

```bash
pnpm run test
```

Перед крупным завершением:

```bash
pnpm run quality:gate
```

Если тестовая БД недоступна, явно зафиксировать:

- какие проверки не выполнены;
- почему;
- какой manual smoke возможен.

## Manual smoke

1. Создать reader-led клуб.
2. Подключить публичный тариф клуба чтеца.
3. Оплатить доступ тестовым платежом через ЮKassa sandbox/test shop.
4. Дождаться webhook или вручную обработать тестовый success flow, если окружение так настроено.
5. Убедиться, что создан `commerce_ledger_entries.reader_earning`.
6. Открыть клуб владельцем.
7. Убедиться, что "Демо-кошелек" показывает баланс.
8. Нажать "Смоделировать вывод".
9. Убедиться, что повторный клик без новых начислений не создает второй вывод.

## Acceptance criteria

Функционал считается готовым для demo-показа, если:

- владелец клуба видит демо-баланс по начислениям;
- баланс строится из `commerce_ledger_entries`;
- demo-withdraw не вызывает внешние финансовые API;
- одна earning-запись не может быть выведена дважды;
- UI явно сообщает, что это demo-режим;
- `pnpm run check` проходит;
- релевантные тесты проходят или причина невозможности запуска зафиксирована.

## Production follow-up

После demo-slice для боевого запуска нужны отдельные задачи:

1. Выбор payout-provider.
2. Хранение payout credentials.
3. Проверка самозанятости и реквизитов.
4. Реальный provider request.
5. Webhook/status polling.
6. Admin review и ручная обработка спорных выплат.
7. Reconciliation платежей, ledger и payout-заявок.
8. Юридические тексты в оферте и пользовательском соглашении.

