# Монетизация и коммерция VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-06-28  
**Версия:** 1.0

## Содержание

1. [Обзор](#обзор)
2. [Архитектура](#архитектура)
3. [Тарифный конструктор](#тарифный-конструктор)
4. [Платёжные провайдеры](#платёжные-провайдеры)
5. [API Endpoints](#api-endpoints)
6. [Подписки](#подписки)
7. [Entitlements](#entitlements)
8. [Клубы чтецов](#клубы-чтецов)
9. [Безопасность платежей](#безопасность-платежей)

## Обзор

VoxLibris поддерживает монетизацию через:
- Подписки на платформу
- Платные клубы чтецов
- Тарифный конструктор для гибкой настройки

### Бизнес-модель

| Уровень | Описание | Цена |
|---------|----------|------|
| Free | Базовый доступ | Бесплатно |
| Premium | Расширенные возможности | По подписке |
| Club Premium | Доступ к платным клубам | По тарифу клуба |

## Архитектура

### Компоненты

```
┌─────────────────┐
│  Tariff Constructor │
└────────┬────────┘
         │
┌────────▼────────┐
│  Commerce Service  │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│YooKassa│ │Reserve│
│Layer 1 │ │Layer 2│
└───────┘ └───────┘
```

### Сущности

| Сущность | Описание |
|----------|----------|
| `Tariff` | Тарифный план с набором функций |
| `Subscription` | Активная подписка пользователя |
| `Entitlement` | Право на доступ к функции |
| `Payment` | Запись о платеже |
| `CommercePeriod` | Период коммерческой активности |

## Тарифный конструктор

### Возможности

- Создание кастомных тарифов
- Настройка периодов (monthly, yearly)
- Гибкое ценообразование
- Feature flags в тарифах
- Trial periods

### Структура тарифа

```typescript
interface Tariff {
  id: string;
  name: string;
  description: string;
  price: number;           // в копейках
  currency: string;        // RUB
  period: 'month' | 'year';
  features: string[];      // список feature flags
  isActive: boolean;
  trialDays: number;       // 0 если нет trial
  createdAt: Date;
}
```

## Платёжные провайдеры

### YooKassa (Layer 1)

Основной платёжный провайдер для российского рынка.

#### Конфигурация

```bash
YOOKASSA_SHOP_ID=your_shop_id
YOOKASSA_SECRET_KEY=your_secret_key
YOOKASSA_API_BASE_URL=https://api.yookassa.ru/v3
```

#### Flow платежа

```
1. Создание платежа → POST /api/commerce/payments
2. Редирект на YooKassa
3. Callback от YooKassa → POST /api/commerce/webhooks/yookassa
4. Активация подписки
5. Отправка уведомления
```

### Reserve Layer 2

Резервный платёжный провайдер на случай недоступности Layer 1.

## API Endpoints

### Тарифы

```http
GET /api/commerce/tariffs
```

**Response:**
```json
{
  "tariffs": [
    {
      "id": "uuid",
      "name": "Premium",
      "price": 99000,
      "currency": "RUB",
      "period": "month",
      "features": ["unlimited_books", "club_access", "no_ads"]
    }
  ]
}
```

### Создание подписки

```http
POST /api/commerce/subscriptions
Authorization: Bearer {token}
Content-Type: application/json

{
  "tariffId": "uuid",
  "paymentMethod": "yookassa"
}
```

**Response:**
```json
{
  "subscriptionId": "uuid",
  "status": "pending",
  "paymentUrl": "https://yookassa.ru/..."
}
```

### Webhook YooKassa

```http
POST /api/commerce/webhooks/yookassa
Content-Type: application/json

{
  "event": "payment.succeeded",
  "object": {
    "id": "payment-id",
    "status": "succeeded",
    "amount": { "value": "990.00", "currency": "RUB" }
  }
}
```

### Проверка entitlements

```http
GET /api/commerce/entitlements
Authorization: Bearer {token}
```

**Response:**
```json
{
  "entitlements": [
    {
      "feature": "club_access",
      "validUntil": "2026-12-31T23:59:59Z",
      "source": "subscription"
    }
  ]
}
```

### История платежей

```http
GET /api/commerce/payments
Authorization: Bearer {token}
```

## Подписки

### Статусы

| Статус | Описание |
|--------|----------|
| `pending` | Ожидает оплаты |
| `active` | Активна |
| `cancelled` | Отменена |
| `expired` | Истекла |
| `suspended` | Приостановлена |

### Автопродление

- Подписки автоматически продлеваются
- Предупреждение за 3 дня до списания
- Отмена в любой момент

### Grace Period

- 3 дня после истечения
- Сохранение доступа к функциям
- Уведомления пользователю

## Entitlements

### Система прав

```typescript
interface Entitlement {
  userId: string;
  feature: string;           // Название функции
  validFrom: Date;
  validUntil: Date;
  source: string;            // subscription, purchase, promo
  metadata?: Record<string, unknown>;
}
```

### Проверка доступа

```typescript
// Проверка перед операцией
const hasAccess = await entitlementService.check(
  userId,
  'club_access',
  { clubId: 'uuid' }
);

if (!hasAccess) {
  throw new EntitlementError('Access denied');
}
```

### Feature Flags

| Feature | Описание | Требуется |
|---------|----------|-----------|
| `unlimited_books` | Безлимитные книги | Premium |
| `club_access` | Доступ к клубам | Premium |
| `reader_club_create` | Создание клубов чтецов | Premium+ |
| `advanced_analytics` | Расширенная аналитика | Premium |
| `custom_themes` | Кастомные темы | Premium |

## Клубы чтецов

### Монетизация клубов

- Клуб может быть платным или бесплатным
- Тарифы настраиваются владельцем клуба
- Комиссия платформы: 10%

### API для клубов

```http
POST /api/commerce/clubs/{clubId}/subscribe
Authorization: Bearer {token}
Content-Type: application/json

{
  "tariffId": "uuid"
}
```

### Управление подписками клуба

```http
GET /api/commerce/clubs/{clubId}/subscribers
Authorization: Bearer {token}  // Только владелец клуба
```

## Безопасность платежей

### Валидация webhook

```typescript
// Проверка подписи YooKassa
function verifyYooKassaWebhook(body: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', YOOKASSA_SECRET_KEY)
    .update(body)
    .digest('base64');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

### Idempotency

- Все платежи имеют idempotency key
- Повторные запросы с тем же ключом возвращают тот же результат
- Защита от двойного списания

### Логирование

- Все платёжные операции логируются
- Маскирование чувствительных данных
- Аудит изменений статусов

## Таблицы базы данных

```sql
-- Тарифы
tariffs (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  price integer NOT NULL,
  currency text DEFAULT 'RUB',
  period text NOT NULL,
  features jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  trial_days integer DEFAULT 0,
  created_at timestamp DEFAULT now()
);

-- Подписки
subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  tariff_id uuid REFERENCES tariffs(id),
  status text NOT NULL,
  started_at timestamp,
  expires_at timestamp,
  cancelled_at timestamp,
  payment_provider text,
  provider_subscription_id text,
  created_at timestamp DEFAULT now()
);

-- Платежи
payments (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  subscription_id uuid REFERENCES subscriptions(id),
  amount integer NOT NULL,
  currency text DEFAULT 'RUB',
  status text NOT NULL,
  provider text NOT NULL,
  provider_payment_id text,
  metadata jsonb,
  created_at timestamp DEFAULT now()
);

-- Entitlements
entitlements (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  feature text NOT NULL,
  valid_from timestamp,
  valid_until timestamp,
  source text NOT NULL,
  metadata jsonb,
  created_at timestamp DEFAULT now()
);
```

## Тестирование

### Smoke тесты

```bash
# Тест YooKassa эмулятора
pnpm run test:yookassa:emulator

# Тест pricing
pnpm run test:pricing:yookassa
```

### Ручные проверки

- [ ] Создание платежа
- [ ] Успешная оплата
- [ ] Отмена подписки
- [ ] Автопродление
- [ ] Grace period
- [ ] Webhook обработка

## Мониторинг

### Метрики

- MRR (Monthly Recurring Revenue)
- Churn rate
- Conversion rate
- Average revenue per user
- Payment success rate

### Алерты

- Падение success rate < 90%
- Рост chargebacks
- Ошибки webhook > 5%
- Проблемы с автопродлением

## Связанная документация

- [Тарифные ключи](TARIFF_KEYS.md) — права доступа и лимиты
- [API Reference](API_REFERENCE.md) — эндпоинты для управления тарифами
- [Админ-руководство](12-admin-manual/README.md) — управление тарифами
