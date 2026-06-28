# Тарифные ключи VoxLibris

**Статус:** Current  
**Дата обновления:** 2026-06-28  
**Версия:** 1.0

## Содержание

1. [Обзор](#обзор)
2. [Штатные ключи](#штатные-ключи)
3. [Правила создания кастомных ключей](#правила-создания-кастомных-ключей)
4. [Реакция системы на кастомные ключи](#реакция-системы-на-кастомные-ключи)
5. [Примеры кастомных ключей](#примеры-кастомных-ключей)
6. [Справочник статусов](#справочник-статусов)
7. [Интеграция с кодом](#интеграция-с-кодом)

## Обзор

Тарифные ключи (tariff keys) — это права доступа, которые выдаются пользователю через систему подписок. Каждый ключ определяет доступ к конкретной функции или лимит ресурса.

### Типы ключей

| Тип | Описание | Пример |
|-----|----------|--------|
| `boolean` | Функция включена/выключена | `personal_books.upload.enabled` |
| `integer` | Лимит или количество | `personal_library.max_books` |
| `string` | Уровень/режим | `club.analytics.level` |
| `json` | Структурированная настройка | сложные конфигурации |

### Жизненный цикл

```
1. Ключ регистрируется в реестре
2. Добавляется в тариф через конструктор
3. Пользователь покупает тариф
4. Система создаёт entitlement-запись
5. Код проверяет entitlement перед операцией
```

## Штатные ключи

### Личная библиотека

| Ключ | Описание | Тип | Значение | Статус |
|------|----------|-----|----------|--------|
| `personal_library.max_books` | Максимальное количество книг | `integer` | `100`, `300`, `1000` | ✅ Работает |
| `personal_books.upload.enabled` | Разрешить загрузку книг | `boolean` | `true`/`false` | ✅ Работает |
| `personal_notes.max_count` | Максимальное количество заметок | `integer` | `500`, `2000` | 📝 Entitlement |

### Клубы

| Ключ | Описание | Тип | Значение | Статус |
|------|----------|-----|----------|--------|
| `clubs.joined.max_count` | Максимум клубов для вступления | `integer` | `10`, `25`, `100` | ✅ Работает |
| `clubs.owned.max_count` | Максимум созданных клубов | `integer` | `1`, `5`, `20` | ✅ Работает |
| `club.members.max_count` | Максимум участников в клубе | `integer` | `20`, `100`, `500` | ✅ Работает |
| `club.private.enabled` | Приватные клубы | `boolean` | `true`/`false` | ✅ Работает |
| `club.books.max_count` | Максимум книг в клубе | `integer` | `5`, `50`, `200` | ✅ Работает |
| `club.moderators.max_count` | Максимум модераторов | `integer` | `1`, `5`, `15` | 📝 Entitlement |
| `club.schedule.enabled` | Расписание клуба | `boolean` | `true`/`false` | 📝 Entitlement |
| `club.discussions.enabled` | Обсуждения в клубе | `boolean` | `true`/`false` | 📝 Entitlement |
| `club.analytics.level` | Уровень аналитики | `string` | `basic`, `pro`, `advanced` | 📝 Entitlement |

### Рекомендации и уведомления

| Ключ | Описание | Тип | Значение | Статус |
|------|----------|-----|----------|--------|
| `recommendations.advanced.enabled` | Расширенные рекомендации | `boolean` | `true` | 📝 Entitlement |
| `calendar.advanced.enabled` | Расширенный календарь | `boolean` | `true` | 📝 Entitlement |
| `notifications.advanced.enabled` | Расширенные уведомления | `boolean` | `true` | 📝 Entitlement |

### Клубы чтецов

| Ключ | Описание | Тип | Значение | Статус |
|------|----------|-----|----------|--------|
| `reader_club_access` | Доступ к клубу чтеца | `boolean` | `true` | ✅ Работает |

### Studio

| Ключ | Описание | Тип | Значение | Статус |
|------|----------|-----|----------|--------|
| `studio.live.enabled` | Live-эфиры Studio | `boolean` | `true` | 📝 Entitlement |
| `studio.live.max_listener_count` | Максимум слушателей | `integer` | `50`, `100`, `500` | 📝 Entitlement |
| `studio.live.max_duration_minutes` | Максимальная длительность | `integer` | `60`, `120`, `240` | 📝 Entitlement |
| `studio.recordings.enabled` | Записи Studio | `boolean` | `true` | 📝 Entitlement |
| `studio.recordings.max_count` | Максимум записей | `integer` | `10`, `50`, `200` | 📝 Entitlement |
| `studio.recordings.storage_mb` | Объём хранилища (МБ) | `integer` | `1000`, `5000`, `50000` | 📝 Entitlement |
| `studio.recordings.publication.enabled` | Публикация записей | `boolean` | `true` | 📝 Entitlement |
| `studio.analytics.level` | Уровень аналитики Studio | `string` | `none`, `basic`, `pro` | 📝 Entitlement |

### Легенда статусов

| Статус | Описание |
|--------|----------|
| ✅ Работает | Проверка реализована в коде |
| 📝 Entitlement | Только запись в БД, требуется разработка проверки |

## Правила создания кастомных ключей

### Формат ключа

```text
domain.resource.capability
```

### Требования

- Латиница, цифры, `_` и точки
- Без пробелов и русских символов
- Стабильность: не переименовывать после продажи тарифов
- Правильный тип значения:
  - `boolean` — функция вкл/выкл
  - `integer` — лимит или количество
  - `string` — уровень/режим
  - `json` — структурированная настройка

### Примеры валидных ключей

```text
ai.recommendations.enabled
ai.summary.max_count
club.branding.enabled
studio.transcription.minutes
support.priority.level
```

### Процесс создания

1. Добавить ключ в админский реестр прав
2. Добавить в тариф как product feature
3. Задать безопасное Freemium-значение по умолчанию
4. Указать paid-значение в тарифе
5. Реализовать проверку в коде

## Реакция системы на кастомные ключи

### Что происходит автоматически

- Ключ хранится в реестре
- Отображается в конструкторе тарифов
- Выдаётся пользователю как entitlement после покупки

### Что требует разработки

Бизнес-поведение изменится только если код явно проверяет ключ:

```typescript
// Проверка доступа
await entitlementService.assertCan(userId, 'ai.recommendations.enabled');

// Проверка лимита
await entitlementService.assertLimit(userId, 'ai.summary.max_count', usedCount);
```

### Без проверки в коде

Ключ работает только как:
- Отображаемый пункт тарифа
- Запись entitlement в БД

Не управляет функциональностью.

## Примеры кастомных ключей

| Ключ | Описание | Тип | Как работает |
|------|----------|-----|--------------|
| `ai.recommendations.enabled` | Доступ к AI-рекомендациям | `boolean` | Проверка перед выдачей рекомендаций |
| `ai.summary.max_count` | AI-конспекты за период | `integer` | Проверка лимита перед созданием |
| `club.branding.enabled` | Кастомное оформление клуба | `boolean` | Проверка в настройках оформления |
| `studio.transcription.minutes` | Минуты расшифровки | `integer` | Проверка лимита перед транскрибацией |
| `support.priority.level` | Уровень поддержки | `string` | Чтение значения для SLA/приоритета |

## Справочник статусов

Машинно-читаемый справочник находится в:

```typescript
// shared/commerce-feature-support.ts
export const commerceFeatureSupport = {
  'personal_library.max_books': { status: 'implemented', enforcement: 'server_limit' },
  'personal_books.upload.enabled': { status: 'implemented', enforcement: 'server_access' },
  'personal_notes.max_count': { status: 'entitlement_only', enforcement: 'not_enforced' },
  // ...
};
```

Конструктор тарифов использует этот справочник для отображения статуса поддержки.

## Интеграция с кодом

### Проверка перед операцией

```typescript
import { EntitlementService } from './services/commerce/entitlement-service';

const entitlementService = new EntitlementService();

// Проверка boolean
async function assertCanUploadBooks(userId: string): Promise<void> {
  await entitlementService.assertCan(userId, 'personal_books.upload.enabled');
}

// Проверка лимита
async function assertBookLimit(userId: string, currentCount: number): Promise<void> {
  await entitlementService.assertLimit(userId, 'personal_library.max_books', currentCount);
}

// Получение числового лимита
async function getBookLimit(userId: string): Promise<number | null> {
  return entitlementService.getLimit(userId, 'personal_library.max_books');
}
```

### Обработка ошибок

```typescript
try {
  await entitlementService.assertCan(userId, 'studio.live.enabled');
} catch (error) {
  if (error instanceof EntitlementError) {
    // Предложить апгрейд тарифа
    return { error: 'Требуется подписка', upgradeUrl: '/pricing' };
  }
  throw error;
}
```

### Freemium значения

```typescript
// Значения по умолчанию для бесплатного тарифа
const FREEMIUM_DEFAULTS = {
  'personal_library.max_books': 100,
  'personal_books.upload.enabled': true,
  'clubs.joined.max_count': 10,
  'club.members.max_count': 20,
};
```

## Связанная документация

- [Монетизация](MONETIZATION.md) — общая архитектура коммерции
- [API Reference](API_REFERENCE.md) — эндпоинты для управления тарифами
- [Админ-руководство](12-admin-manual/README.md) — управление тарифами
