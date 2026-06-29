# Архитектура демо-кошелька чтеца

**Статус:** Roadmap  
**Дата:** 2026-06-29

## Контекст

В текущем commerce-контуре уже есть основа для начислений:

- `commerce_payments` фиксирует платеж;
- `commerce_orders` связывает платеж с продуктом;
- `commerce_products` и `commerce_prices` описывают тариф;
- `reader_club_tariff_assignments` хранит долю чтеца и комиссию эквайринга;
- `commerce_ledger_entries` создается после успешного платежа и содержит `reader_earning`, `platform_fee`, `acquiring_fee`.

Демо-кошелек строится поверх `commerce_ledger_entries`. Он не должен дублировать расчет долей и не должен использовать legacy-таблицы `reader_earnings`, `listener_payments`, `club_monetization` для новых сценариев.

## Цели

1. Показать владельцу клуба чтецов доступный баланс.
2. Показать прозрачную разбивку платежа слушателя: доход чтеца, комиссия платформы, эквайринг.
3. Смоделировать заявку на вывод средств как самозанятому.
4. Сохранить модель так, чтобы позже добавить реального payout-provider без переписывания ledger.

## Не-цели

- Реальные выплаты.
- Реальная проверка самозанятости.
- Автоматическое списание денег с расчетного счета платформы.
- Интеграция с внешним payout API.
- Сложный бухгалтерский модуль.

## Принципы

- Ledger является источником правды по начислениям.
- Payout request является отдельным workflow, а не изменением платежа слушателя.
- Demo-provider явно маркируется как demo и не маскируется под реальную выплату.
- UI и API используют слова "демо-заявка", "демо-вывод", "смоделировать вывод".
- Доступ к кошельку имеет только сам чтец-владелец начислений и системные admin/moderator.
- Нельзя выводить больше доступного баланса даже в demo-режиме.

## Доменная модель

### Источник начислений

Используется существующая таблица:

```text
commerce_ledger_entries
```

Для кошелька учитываются записи:

```text
entry_type = 'reader_earning'
reader_user_id = current user id
status = 'available'
```

### Новые сущности

#### `commerce_payout_requests`

Заявка на вывод. В demo-slice она не уходит во внешний сервис.

Предлагаемые поля:

```text
id                    varchar primary key
reader_user_id         varchar not null references users(id)
amount_kopecks         integer not null
provider_code          varchar(40) not null default 'demo'
provider_payout_id     varchar(180)
status                 varchar(30) not null
requested_by           varchar references users(id)
processed_by           varchar references users(id)
failure_reason         text
metadata               jsonb not null default '{}'
created_at             timestamp not null default now()
updated_at             timestamp not null default now()
processed_at           timestamp
```

Статусы:

| Статус | Значение |
|---|---|
| `requested` | заявка создана и резервирует доступные начисления |
| `processing` | обработка начата |
| `demo_paid` | demo-provider пометил заявку как успешно обработанную |
| `paid` | будущая реальная выплата завершена |
| `failed` | обработка не удалась |
| `cancelled` | заявка отменена до выплаты |

#### `commerce_payout_request_entries`

Связь заявки с ledger entries. Нужна, чтобы одна и та же earning-запись не попала в несколько заявок.

Предлагаемые поля:

```text
id                  varchar primary key
payout_request_id   varchar not null references commerce_payout_requests(id)
ledger_entry_id     varchar not null references commerce_ledger_entries(id)
amount_kopecks      integer not null
created_at          timestamp not null default now()
```

Ограничение:

```text
unique(ledger_entry_id)
```

В demo-slice рекомендуется поддержать только вывод всего доступного баланса. Это убирает частичное резервирование одной ledger entry и сохраняет простую модель. Частичный вывод можно добавить позже, когда появится реальный payout-provider.

## Расчет баланса

Баланс чтеца состоит из:

```text
earned_total = sum(reader_earning ledger entries)
reserved = sum(payout entries for requested/processing)
demo_paid = sum(payout entries for demo_paid)
paid = sum(payout entries for paid)
available = earned_total - reserved - demo_paid - paid
```

Для demo-режима `demo_paid` уменьшает доступный демо-баланс, но не означает реальную выплату.

## API

### `GET /api/commerce/me/reader-wallet`

Возвращает кошелек текущего пользователя.

Доступ:

- `jwtAuth`;
- только текущий пользователь;
- admin/moderator могут получить чужой кошелек через отдельный admin endpoint, если он будет нужен позже.

Ответ:

```json
{
  "balance": {
    "earnedTotalKopecks": 50000,
    "availableKopecks": 40000,
    "reservedKopecks": 0,
    "demoPaidKopecks": 10000,
    "paidKopecks": 0
  },
  "entries": [
    {
      "id": "ledger-id",
      "clubId": "club-id",
      "productId": "product-id",
      "amountKopecks": 40000,
      "createdAt": "2026-06-29T00:00:00.000Z"
    }
  ],
  "payoutRequests": [
    {
      "id": "request-id",
      "amountKopecks": 10000,
      "providerCode": "demo",
      "status": "demo_paid",
      "createdAt": "2026-06-29T00:00:00.000Z",
      "processedAt": "2026-06-29T00:00:10.000Z"
    }
  ]
}
```

### `POST /api/commerce/me/reader-wallet/demo-withdraw`

Создает demo-заявку на вывод всего доступного баланса.

Request:

```json
{
  "confirmDemo": true
}
```

Правила:

- доступный баланс должен быть больше 0;
- endpoint работает в транзакции;
- выбираются только unreserved `reader_earning` entries текущего пользователя;
- создается `commerce_payout_requests`;
- создаются `commerce_payout_request_entries`;
- заявка переводится в `demo_paid`;
- реальные внешние API не вызываются.

Ответ:

```json
{
  "requestId": "request-id",
  "status": "demo_paid",
  "amountKopecks": 40000,
  "message": "Демо-заявка обработана. Реальная выплата не выполнялась."
}
```

### Будущие admin endpoints

Для demo-slice не обязательны, но модель должна позволять добавить:

```text
GET  /api/commerce/admin/payout-requests
POST /api/commerce/admin/payout-requests/:id/process
POST /api/commerce/admin/payout-requests/:id/cancel
```

## UI

Минимальный UI размещается в контексте владельца клуба чтецов:

- страница клуба чтецов, вкладка или карточка "Демо-кошелек";
- видна только владельцу клуба;
- показывает доступный баланс;
- показывает последнюю разбивку: "чтецу", "комиссия платформы", "эквайринг";
- кнопка "Смоделировать вывод";
- после клика показывает статус demo-заявки.

Текст должен явно отделять demo от реальных финансов:

```text
Это демонстрационный кошелек. Деньги не выводятся на банковский счет.
Боевой режим потребует подключения payout-provider и проверки самозанятости.
```

## Серверные проверки

- `reader_user_id` всегда берется из JWT, а не из body.
- Нельзя создать demo-withdraw на чужой баланс.
- Нельзя создать заявку без доступных ledger entries.
- Ledger entries, уже связанные с payout request в статусах `requested`, `processing`, `demo_paid`, `paid`, не считаются доступными.
- Все операции создания заявки выполняются в транзакции.
- Нельзя логировать персональные реквизиты, токены, email-токены и приватные данные.

## Переход к production payout

Боевой слой добавляется без изменения источника начислений:

1. Добавить `provider_code = 'yookassa_payouts'` или другой провайдер.
2. Добавить encrypted credentials для payout-provider отдельно от payment-provider.
3. Реализовать обработчик отправки заявки во внешний API.
4. Добавить webhook/status polling.
5. На успешном webhook переводить заявку в `paid`.
6. На ошибке переводить в `failed` и освобождать связанные ledger entries для повторной заявки.
7. Добавить проверку самозанятости и реквизитов.

До появления второго реального провайдера не нужно вводить сложную provider-interface и factory. Достаточно простой функции demo-обработки и изолированного места, куда позже будет добавлен реальный provider.

## Риски

| Риск | Митигирующее решение |
|---|---|
| Пользователь воспримет demo как реальную выплату | Явные тексты demo-режима в UI и API response |
| Повторный вывод одной earning-записи | `commerce_payout_request_entries` + `unique(ledger_entry_id)` |
| Смешение demo и production | `provider_code`, статусы `demo_paid` и `paid` разделены |
| Сложная частичная выплата | В demo-slice выводим весь доступный баланс |
| Расхождение с бухгалтерией | Demo-заявки не считаются реальными выплатами |

