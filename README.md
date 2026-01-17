# xLibris - Аудиокниги платформа

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.0.0-orange)

Современная платформа для прослушивания аудиокниг с поддержкой Spec-Driven Development.

## 🚀 Быстрый старт

### Предварительные требования
- Node.js 22+
- PostgreSQL 14+
- pnpm
- uv (для SDD)

### Установка и запуск

```bash
# Клонировать репозиторий
git clone <repository-url>
cd xLibris

# Установить зависимости
pnpm install

# Настроить переменные окружения
cp .env.example .env
# Отредактировать .env с вашими настройками

# Настроить базу данных
createdb xlibris
pnpm run db:push

# Запустить development сервер
pnpm run dev
```

Приложение будет доступно по адресу http://localhost:5000

## 📸 Скриншоты

_Скриншоты будут добавлены в ближайшее время_

## 🏗️ Архитектура

### Tech Stack
- **Frontend**: React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Build**: Vite + pnpm
- **Development**: Spec-Driven Development (SDD)

### Структура проекта
```
xLibris/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI компоненты
│   │   ├── pages/          # Страницы приложения
│   │   ├── hooks/          # React hooks
│   │   └── lib/            # Утилиты
├── server/                 # Express backend
│   ├── index.ts           # Главный сервер
│   ├── routes.ts          # API маршруты
│   └── vite.ts            # Vite middleware
├── shared/                 # Общие типы и схемы
├── .specify/              # SDD конфигурация
└── migrations/            # Database migrations
```

## 📋 Spec-Driven Development

Проект использует [GitHub Spec Kit](https://github.com/github/spec-kit) для структурированной разработки.

### Основные команды SDD

```bash
# Установить Specify CLI (если не установлен)
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# Проверить установку
specify check
```

### Workflow разработки новых функций

1. **Создать спецификацию**
   ```
   /speckit.specify <описание функции>
   ```

2. **Уточнить требования** (опционально)
   ```
   /speckit.clarify
   ```

3. **Создать план реализации**
   ```
   /speckit.plan
   ```

4. **Сгенерировать задачи**
   ```
   /speckit.tasks
   ```

5. **Реализовать функцию**
   ```
   /speckit.implement
   ```

### Принципы разработки

Смотрите [Конституцию проекта](.specify/memory/constitution.md) для полного описания принципов и стандартов.

## 🎵 Аудио функции

### Поддерживаемые форматы
- MP3
- M4A
- OGG
- FLAC

### Основные возможности
- Streaming воспроизведение
- Bookmarks и resume
- Контроль скорости (0.5x - 3.0x)
- Sleep timer
- Chapter navigation
- Офлайн режим

## 🧪 Тестирование

```bash
# Запустить тесты
pnpm test

# Тесты с покрытием
pnpm test:coverage

# E2E тесты
pnpm test:e2e
```

## 📦 Сборка и деплой

```bash
# Сборка для production
pnpm run build

# Запуск production сервера
pnpm start
```

## 🤝 Вклад в проект

1. Создайте feature branch от `main`
2. Используйте SDD workflow для разработки
3. Убедитесь, что все тесты проходят
4. Создайте Pull Request с описанием изменений

## 📄 Лицензия

Этот проект лицензирован по лицензии MIT - подробности смотрите в файле [LICENSE](LICENSE).

MIT License - смотрите [LICENSE](LICENSE) файл для деталей.