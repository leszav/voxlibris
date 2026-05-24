# Gamification System Refactoring - Testing Guide

## Этап 8: Полное тестирование системы достижений

### 1. Юнит тесты

```bash
npm run test -- server/__tests__/gamification.test.ts
```

Проверяет:
- ✅ Резолвер полей (users.role, activity counters, derived fields)
- ✅ Валидация условий (blockCode, operator, value structure)
- ✅ AND/OR логика в оценке достижений
- ✅ Структура field registry
- ✅ Building blocks с sourceKey

**Ожидаемый результат:** Все 15 тестов пройдены

---

### 2. Интеграционные тесты API

**Требования:**
- PostgreSQL запущена (migrations 0044 applied)
- Сервер запущен на `http://localhost:3000`
- Redis запущен (для cache)

#### Сценарий A: Field Registry Loading

```bash
curl -X GET http://localhost:3000/api/admin/gamification/field-registry \
  -H "Authorization: Bearer <admin-token>"
```

**Ожидается:**
```json
{
  "Users": [
    { "key": "users.role", "type": "string", "label": "Роль пользователя", "group": "Users" }
  ],
  "Activity": [
    { "key": "user_activity_counters.completed_books_count", "type": "number", ... }
  ],
  "Derived": [
    { "key": "derived.tenure_days", "type": "number", ... }
  ]
}
```

#### Сценарий B: Field Values Fetching

```bash
curl -X GET "http://localhost:3000/api/admin/gamification/field-values?field=users.role" \
  -H "Authorization: Bearer <admin-token>"
```

**Ожидается:**
```json
["admin", "moderator", "user"]
```

#### Сценарий C: Building Block Creation with sourceKey

```bash
curl -X POST http://localhost:3000/api/admin/gamification/building-blocks \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "test_role",
    "labelRu": "Тестовая роль",
    "valueType": "string",
    "supportedOperators": ["=", "!="],
    "sourceKey": "users.role"
  }'
```

**Ожидается:** HTTP 201, вернувшийся объект содержит `"sourceKey": "users.role"`

#### Сценарий D: Achievement Creation with Validation

```bash
curl -X POST http://localhost:3000/api/admin/gamification/achievements \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "titleRu": "Тест роли",
    "descriptionRu": "Проверка условия роли",
    "iconUrl": "https://example.com/icon.png",
    "conditionsPayload": [
      {
        "blockCode": "test_role",
        "operator": "=",
        "valueType": "string",
        "value": "admin"
      }
    ],
    "conditionsLogic": "AND",
    "rewardAssets": []
  }'
```

**Ожидается:** HTTP 201, достижение создано

**Если blockCode неверен:**
```json
{ "error": "Unknown blockCode: test_role" }
```
**Ожидается:** HTTP 400

#### Сценарий E: Dry-Run Evaluation

```bash
curl -X POST http://localhost:3000/api/admin/gamification/dry-run \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<real-user-id>",
    "conditionsPayload": [
      {
        "blockCode": "role",
        "operator": "=",
        "valueType": "string",
        "value": "admin"
      }
    ]
  }'
```

**Ожидается:**
```json
{
  "snapshot": {
    "userId": "...",
    "userRole": "admin",
    "completedBooksCount": 5,
    ...
  },
  "results": [
    {
      "blockCode": "role",
      "operator": "=",
      "expected": "admin",
      "actual": "admin",
      "passed": true
    }
  ],
  "overallPassed": true
}
```

#### Сценарий F: Manual Reconciliation

```bash
curl -X POST http://localhost:3000/api/admin/gamification/reconcile/run \
  -H "Authorization: Bearer <admin-token>"
```

**Ожидается:**
```json
{
  "summary": {
    "processed": 42,
    "awarded": 8,
    "errors": 0
  },
  "duration_ms": 1234
}
```

---

### 3. Ручное тестирование в UI

#### Шаг 1: Откройте Admin Panel
- Перейдите на `/admin/gamification`
- Убедитесь что Section "Параметры условий" загрузился (вместо "Кирпичики")

#### Шаг 2: Создайте новый параметр условия
1. Нажмите "Новый параметр условия"
2. Заполните форму:
   - Code: `test_status`
   - Label: `Статус профиля`
   - Value Type: `string`
   - Supported Operators: `=, !=`
   - Source Key: `user_profiles.status`
3. Нажмите Save
4. ✅ Параметр создан и отображается в списке

#### Шаг 3: Создайте новое достижение с условиями
1. Нажмите "Новое достижение"
2. Заполните базовую информацию
3. Добавьте условие:
   - Параметр условия: выберите `Статус профиля` (должен загрузиться dropdown с DISTINCT значениями)
   - Оператор: `=`
   - Значение: выберите из dropdown (например, "active")
4. Нажмите Save
5. ✅ Достижение создано и условия сохранены

#### Шаг 4: Протестируйте Dry-Run
1. Нажмите "Actions" на созданном достижении
2. Выберите "Dry Run"
3. Выберите тестового пользователя
4. ✅ Вернулся результат с snapshot и условиями

#### Шаг 5: Запустите Manual Reconciliation
1. Нажмите "Пересчитать достижения" в header
2. Ждите завершения
3. ✅ Появилась toast: "Пересчёт завершен"

---

### 4. Проверка миграции

```bash
# На dev машине
psql -U xlibris -h localhost -d xlibris -c "
  SELECT id, code, source_key FROM achievement_building_blocks 
  WHERE source_key IS NOT NULL 
  ORDER BY created_at DESC LIMIT 10;
"
```

**Ожидается:** 8-10 параметров условия с заполненными source_key:
- `tenure_days` → `derived.tenure_days`
- `completed_books` → `user_activity_counters.completed_books_count`
- `role` → `users.role`
- и т.д.

---

### 5. Критерии успеха

- [ ] Все 15 юнит-тестов пройдены
- [ ] Field Registry возвращает 5 групп (Users, Activity, Profile, Streaks, Derived)
- [ ] Building Block сохраняется с sourceKey
- [ ] Achievement сохраняется с условиями
- [ ] Dry-Run возвращает правильный snapshot и результаты
- [ ] Manual Reconciliation обрабатывает всех пользователей
- [ ] UI показывает "Параметры условий" вместо "Кирпичики"
- [ ] UI dropdown загружает DISTINCT значения для каждого поля
- [ ] Миграция 0044 применена и параметры видны в БД
- [ ] Нет ошибок валидации/компиляции в консоли

---

### 6. Откат (если нужен)

Если что-то пошло не так:

```bash
# Откатить миграцию 0044 (вручную через pgAdmin)
DROP TABLE IF EXISTS achievement_reward_assets CASCADE;
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS achievement_building_blocks CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;
-- Повторно применить 0043_add_direct_messages.sql
```

---

### 7. Документирование результатов

После завершения тестирования добавьте результаты в:
- `/memories/repo/gamification-testing-results.md`

Укажите:
- Дата/время тестирования
- Какие сценарии пройдены
- Какие ошибки найдены и как исправлены
- Общее время на тестирование
