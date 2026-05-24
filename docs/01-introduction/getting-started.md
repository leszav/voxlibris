# Быстрый старт

Это пошаговое руководство поможет вам установить и запустить VoxLibris на вашем локальном компьютере.

## Требования

- **Node.js**: v20.0.0 или выше
- **pnpm**: v9.x или выше
- **PostgreSQL**: v14 или выше
- **Docker**: для запуска PostgreSQL и MinIO (опционально)

## Установка

### 1. Клонирование репозитория

```bash
git clone https://github.com/your-org/voxlibris.git
cd voxlibris
```

### 2. Установка зависимостей

```bash
pnpm install
```

### 3. Настройка переменных окружения

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Отредактируйте файл `.env` и укажите ваши настройки:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/voxlibris"

# JWT Secrets
JWT_SECRET="your-secret-key-here"
JWT_REFRESH_SECRET="your-refresh-secret-here"

# File Storage (MinIO or S3)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=voxlibris-bucket
S3_REGION=us-east-1

# SMTP (for email notifications)
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=username
SMTP_PASS=password
SMTP_FROM=noreply@example.com
```

### 4. Запуск зависимостей (с использованием Docker)

```bash
# Запуск PostgreSQL и MinIO
docker compose up postgres minio -d
```

### 5. Инициализация базы данных

```bash
# Применение миграций
pnpm run db:push

# Инициализация хранилища
pnpm run init-storage
```

### 6. Запуск приложения

```bash
# Запуск в режиме разработки
pnpm run dev
```

После запуска приложение будет доступно:

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:5000](http://localhost:5000)

## Структура проекта

```
.
├── client/                 # Frontend приложения
│   ├── src/
│   │   ├── components/     # React компоненты
│   │   ├── pages/          # Страницы приложения
│   │   ├── hooks/          # React хуки
│   │   └── lib/            # Вспомогательные библиотеки
├── server/                 # Backend приложения
│   ├── routes/             # API маршруты
│   ├── services/           # Бизнес-логика
│   ├── repositories/       # Работа с базой данных
│   ├── middleware/         # Express middleware
│   └── config/             # Конфигурационные файлы
├── shared/                 # Общие типы и схемы
├── migrations/             # Миграции базы данных
└── docs/                   # Документация
```

## Основные команды

```bash
# Запуск в режиме разработки
pnpm run dev

# Сборка проекта
pnpm run build

# Запуск продакшн-сборки
pnpm run start

# Запуск тестов
pnpm run test

# Проверка типов
pnpm run check

# Линтинг
pnpm run lint
```

## Следующие шаги

После успешной установки вы можете:

1. Зарегистрировать нового пользователя через интерфейс
2. Создать первый книжный клуб
3. Загрузить книгу в формате EPUB или FB2
4. Начать сессию чтения с друзьями

Для более подробной информации о разработке см. соответствующие разделы документации.