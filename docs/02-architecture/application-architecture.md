# Архитектурный анализ приложения VoxLibris

## Общая информация о проекте

VoxLibris - это платформа для социального чтения, позволяющая пользователям создавать и участвовать в книжных клубах, где книги могут читаться вслух профессиональными чтецами или другими пользователями. Приложение представляет собой веб-платформу с архитектурой "клиент-сервер", где клиент реализован как SPA на React 19, а сервер - как Express-приложение на Node.js.

## Архитектурные особенности

### Технологический стек

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript + Node.js 20+
- **Database**: PostgreSQL 14+ + Drizzle ORM
- **File Storage**: AWS S3-совместимое хранилище (MinIO)
- **Real-time communication**: WebSocket (Socket.IO)
- **Authentication**: JWT токены + система refresh токенов
- **Security**: Helmet, express-rate-limit, bcrypt, CORS
- **Build tool**: Vite + pnpm@9

### Слои архитектуры

1. **Presentation Layer** (client/src): UI компоненты, страницы, маршруты на стороне клиента
2. **API Layer** (server/routes): REST API и WebSocket интерфейсы
3. **Business Logic Layer** (server/services): бизнес-логика приложения
4. **Data Access Layer** (server/repositories): взаимодействие с базой данных через Drizzle ORM
5. **Infrastructure Layer** (server/lib, server/config): конфигурация, логирование, безопасность

### Структура проекта

```
.
├── client                      # Frontend приложения
│   ├── src
│   │   ├── api               # API клиенты
│   │   ├── components        # React компоненты
│   │   ├── hooks             # React хуки
│   │   ├── lib               # Вспомогательные библиотеки
│   │   ├── pages             # Страницы приложения
│   │   └── styles            # Стили
│   └── index.html
├── server                     # Backend приложения
│   ├── analytics             # Система аналитики
│   ├── audio                 # Аудио обработка
│   ├── config                # Конфигурационные файлы
│   ├── lib                   # Вспомогательные библиотеки
│   ├── repositories          # Репозитории данных
│   ├── routes                # API маршруты
│   ├── services              # Бизнес-логика
│   ├── websocket             # WebSocket обработчики
│   └── прочие файлы сервера
├── shared                     # Общие типы и схемы
├── migrations                # Миграции базы данных
├── email-templates           # Шаблоны электронной почты
├── script, scripts           # Скрипты разработки и деплоя
└── корневые файлы проекта
```

### Паттерны проектирования

- **Repository pattern**: все операции с базой данных инкапсулированы в [repositories/](file:///home/odmen/DEV/voxlibris/server/repositories)
- **Middleware pattern**: Express middleware для аутентификации (JWT), логирования, ограничения частоты запросов
- **Event-driven architecture**: WebSocket используется для реального времени (синхронизация чтения, чат)
- **Modular routing**: API маршруты разделены по функциям (auth, club, reading-session и т.д.)

## Взаимодействие компонентов

### Клиент-серверное взаимодействие

1. Клиент (React SPA) делает HTTP-запросы к REST API сервера
2. Для аутентификации используются JWT-токены (в заголовках и cookies)
3. Для реального времени используются WebSocket-соединения (Socket.IO)
4. Файлы (обложки, книги) загружаются и выгружаются через специальные API-эндпоинты

### Безопасность

- Все пароли хранятся в зашифрованном виде с использованием bcrypt
- JWT-токены используются для аутентификации
- Вводимые данные очищаются с помощью dompurify для предотвращения XSS
- Защита от чрезмерного использования API через express-rate-limit
- Строгая политика CORS

### Масштабируемость и производительность

- Поддержка Redis для хранения ограничений по частоте запросов
- Потоковая передача аудиофайлов
- Низкая задержка вещания через WebSocket (<100 мс)
- Оптимизация загрузки страниц через разделение кода Vite

## Основные зависимости и их роль

- `drizzle-orm`: ORM для взаимодействия с PostgreSQL
- `express`: основной фреймворк для сервера
- `socket.io`: реализация WebSocket-соединений
- `react`: основа клиентского приложения
- `react-query`: управление состоянием на клиенте
- `helmet`, `express-rate-limit`: обеспечение безопасности
- `multer`, `sharp`: обработка загружаемых файлов
- `bcrypt`, `jsonwebtoken`: аутентификация и авторизация