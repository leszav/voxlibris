# Скрипты проекта

В этом разделе описаны различные скрипты и утилиты, используемые в проекте VoxLibris.

## Обзор скриптов

Проект содержит два основных каталога со скриптами:

- **`script/`** - основные скрипты для разработки и обслуживания
- **`scripts/`** - дополнительные утилиты и CI/CD скрипты

## Основные скрипты (script/)

### Сборка и разработка
- **`build.ts`** - скрипт сборки проекта
- **`seed.ts`** - наполнение базы данных тестовыми данными
- **`run-all-migrations.ts`** - запуск всех миграций базы данных

### Проверки и валидация
- **`check-connections.ts`** - проверка соединений с внешними сервисами
- **`check-static-images.ts`** - проверка статических изображений
- **`verify-schema.ts`** - валидация схемы базы данных
- **`validate-lts.sh`** - проверка LTS совместимости

### Оптимизация
- **`optimize-static-images.ts`** - оптимизация статических изображений
- **`init-storage.ts`** - инициализация файлового хранилища

### Тестирование и отладка
- **`debug-clubs-issues.ts`** - отладка проблем с клубами
- **`studio-sim.ts`** - симулятор студии
- **`qa-load-smoke.ts`** - нагрузочное тестирование

### Генерация
- **`generate-favicon.js`** - генерация фавиконок
- **`render-dependency-visualizations.ts`** - визуализация зависимостей

### Утилиты
- **`force-kill-ports.sh`** - принудительное завершение процессов на портах
- **`update-license-across-branches.sh`** - обновление лицензии

## Дополнительные скрипты (scripts/)

### Аутентификация и безопасность
- **`auth-audit.ts`** - аудит системы аутентификации
- **`auth-workflow-test.ts`** - тестирование workflow аутентификации

### CI/CD
- **`ci-cd-setup.sh`** - настройка CI/CD
- **`ci-cd-setup-monolith-backup.sh`** - настройка CI/CD с бэкапом
- **`simple-compliance-test.sh`** - простые тесты соответствия
- **`test-compliance-system.sh`** - тестирование системы соответствия
- **`test-compliance-system-broken.sh`** - тестирование неработающей системы

### Тестирование
- **`test-guest-flow.js`** - тестирование flow для гостей

## Использование скриптов

### Запуск через pnpm

Большинство скриптов можно запустить через pnpm:

```bash
# Запуск основного скрипта
pnpm run build
pnpm run seed
pnpm run db:migrate

# Запуск дополнительных скриптов
node scripts/auth-audit.ts
node scripts/test-guest-flow.js
```

### Прямой запуск

```bash
# TypeScript скрипты
npx tsx script/build.ts
npx tsx script/seed.ts

# Shell скрипты
./script/force-kill-ports.sh
./scripts/ci-cd-setup.sh

# JavaScript скрипты
node script/generate-favicon.js
```

## Разработка скриптов

### Структура TypeScript скриптов

```typescript
#!/usr/bin/env tsx

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';

async function main() {
  // Логика скрипта
  console.log('Script execution completed');
}

main().catch(console.error);
```

### Рекомендации

1. **Используйте TypeScript** для всех новых скриптов
2. **Добавляйте обработку ошибок** и логирование
3. **Следуйте конвенциям именования**
4. **Документируйте назначение** каждого скрипта
5. **Проверяйте окружение** перед выполнением

## Переменные окружения

Скрипты используют те же переменные окружения, что и основное приложение:

- `DATABASE_URL` - строка подключения к PostgreSQL
- `REDIS_URL` - строка подключения к Redis
- `MINIO_ENDPOINT` - эндпоинт MinIO
- `MINIO_ACCESS_KEY` - ключ доступа MinIO
- `MINIO_SECRET_KEY` - секретный ключ MinIO

## Отладка скриптов

### Включение логов

```bash
# Уровень логирования
export LOG_LEVEL=debug

# Запуск скрипта
npx tsx script/debug-clubs-issues.ts
```

### Тестовый режим

```bash
# Используйте тестовую базу данных
export DATABASE_URL="postgresql://user:pass@localhost:5432/voxlibris_test"

# Запуск в dry-run режиме (если поддерживается)
npx tsx script/seed.ts --dry-run
```

## Автоматизация

### Git hooks

Некоторые скрипты могут быть автоматически запущены через Git hooks:

```bash
# Pre-commit hook
npx lint-staged

# Pre-push hook
npm run test
```

### Cron задачи

Для периодических задач можно использовать cron:

```bash
# Ежедневная проверка системы
0 2 * * * cd /path/to/voxlibris && npx tsx script/check-connections.ts

# Еженедельная оптимизация изображений
0 3 * * 0 cd /path/to/voxlibris && npx tsx script/optimize-static-images.ts
```

## troubleshooting

### Частые проблемы

1. **Ошибки подключения** - проверьте переменные окружения
2. **Rights доступ** - убедитесь что скрипт выполняемый: `chmod +x script.sh`
3. **Версии Node.js** - используйте рекомендуемую версию из `.nvmrc`
4. **Зависимости** - установите их: `pnpm install`

### Получение помощи

```bash
# Показать помощь (если реализовано)
npx tsx script/build.ts --help

# Проверить версию
npx tsx script/build.ts --version
```

---

Для получения дополнительной информации обратитесь к [разделу разработки](../03-configuration/) или создайте issue в репозитории.