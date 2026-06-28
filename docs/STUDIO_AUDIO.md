# VoxLibris Studio и аудио-система

**Статус:** Current  
**Дата обновления:** 2026-06-28  
**Версия:** 1.0

## Содержание

1. [Обзор](#обзор)
2. [Архитектура аудио](#архитектура-аудио)
3. [Icecast Streaming](#icecast-streaming)
4. [Studio Stream](#studio-stream)
5. [Записи](#записи)
6. [Качество чтецов](#качество-чтецов)
7. [WebSocket для сессий](#websocket-для-сессий)
8. [API Endpoints](#api-endpoints)

## Обзор

VoxLibris Studio — система для проведения аудио-сессий чтения вслух. Включает:
- Потоковое вещание через Icecast
- Запись сессий
- Оценку качества чтецов
- Управление сессиями в реальном времени

## Архитектура аудио

### Компоненты

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Reader    │────▶│   Studio    │────▶│   Icecast   │
│  (Browser)  │     │   (Server)  │     │   (Stream)  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                                       ┌────────▼────────┐
                                       │   Listeners     │
                                       │   (Browser)     │
                                       └─────────────────┘
```

### Технологии

| Компонент | Технология | Назначение |
|-----------|------------|------------|
| Захват аудио | Web Audio API | Захват с микрофона |
| Кодирование | Opus | Сжатие аудио |
| Стриминг | Icecast | Потоковое вещание |
| Прокси | Node.js | Проксирование потока |
| Запись | FFmpeg | Сохранение записей |

## Icecast Streaming

### Конфигурация

```bash
# Icecast сервер
ICECAST_HOST=radio.voxlibris.ru
ICECAST_PORT=8000
ICECAST_MOUNT=/live
```

### Проксирование

Сервер проксирует запросы на Icecast:

```typescript
// /live/:sessionId
app.get('/live/:sessionId', createIcecastLiveProxy());
```

### Подключение слушателей

Слушатели подключаются к прокси:
```html
<audio src="/live/{sessionId}" controls></audio>
```

## Studio Stream

### Flow трансляции

```
1. Чтец открывает Studio
2. Проверка микрофона (mic-check)
3. Создание сессии чтения
4. Подключение к Icecast
5. Начало трансляции
6. Слушатели подключаются
7. Остановка трансляции
8. Сохранение записи (опционально)
```

### API

```http
POST /api/studio/stream/start
Authorization: Bearer {token}
Content-Type: application/json

{
  "clubId": "uuid",
  "bookId": "uuid",
  "chapter": 1
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "streamUrl": "https://radio.voxlibris.ru/live/{sessionId}",
  "icecastConfig": {
    "host": "radio.voxlibris.ru",
    "port": 8000,
    "mount": "/live/{sessionId}",
    "password": "..."
  }
}
```

```http
POST /api/studio/stream/stop
Authorization: Bearer {token}
Content-Type: application/json

{
  "sessionId": "uuid"
}
```

### Mic Check

Проверка микрофона перед трансляцией:
- Запись 5-секундного теста
- Воспроизведение записи
- Проверка уровня сигнала

```http
POST /api/studio/mic-check
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: Blob (audio/webm)
```

## Записи

### Управление записями

Записи сессий сохраняются для последующего прослушивания:

```http
GET /api/recordings?clubId={uuid}&limit=20
Authorization: Bearer {token}
```

**Response:**
```json
{
  "recordings": [
    {
      "id": "uuid",
      "title": "Война и мир, глава 1",
      "duration": 1800,
      "fileUrl": "https://...",
      "fileSize": 15000000,
      "createdAt": "2026-01-15T10:30:00Z",
      "reader": {
        "userId": "uuid",
        "username": "reader1"
      }
    }
  ]
}
```

### Публикация записей

```http
POST /api/recordings/{id}/publish
Authorization: Bearer {token}
```

### Workflow публикации

| Статус | Описание |
|--------|----------|
| `recording` | Идёт запись |
| `processing` | Обработка |
| `pending_review` | Ожидает проверки |
| `published` | Опубликована |
| `rejected` | Отклонена |

## Качество чтецов

### Метрики

| Метрика | Описание | Диапазон |
|---------|----------|----------|
| `clarity` | Чёткость речи | 1-10 |
| `pace` | Темп чтения | 1-10 |
| `expression` | Выразительность | 1-10 |
| `pronunciation` | Произношение | 1-10 |
| `overall` | Общая оценка | 1-10 |

### Оценка

```http
POST /api/reader-quality/rate
Authorization: Bearer {token}
Content-Type: application/json

{
  "recordingId": "uuid",
  "metrics": {
    "clarity": 8,
    "pace": 7,
    "expression": 9,
    "pronunciation": 8
  },
  "comment": "Отличное чтение!"
}
```

### Рейтинг чтецов

```http
GET /api/reader-quality/top?period=month&limit=10
```

**Response:**
```json
{
  "readers": [
    {
      "userId": "uuid",
      "username": "reader1",
      "averageRating": 8.5,
      "totalSessions": 15,
      "totalListeners": 150
    }
  ]
}
```

## WebSocket для сессий

### События

| Событие | Направление | Данные |
|---------|-------------|--------|
| `session:join` | Клиент → Сервер | `{ sessionId: uuid }` |
| `session:leave` | Клиент → Сервер | `{ sessionId: uuid }` |
| `session:state` | Сервер → Клиент | `{ state: string, data: object }` |
| `session:progress` | Сервер → Клиент | `{ position: number, percentage: number }` |
| `session:listener_count` | Сервер → Клиент | `{ count: number }` |

### Состояния сессии

| Статус | Описание |
|--------|----------|
| `idle` | Ожидание |
| `preparing` | Подготовка |
| `live` | В эфире |
| `paused` | Пауза |
| `ended` | Завершена |

## API Endpoints

### Studio

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/studio/stream/start` | Начать трансляцию |
| POST | `/api/studio/stream/stop` | Остановить трансляцию |
| POST | `/api/studio/mic-check` | Проверка микрофона |
| GET | `/api/studio/sessions/active` | Активные сессии |

### Записи

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/recordings` | Список записей |
| GET | `/api/recordings/{id}` | Детали записи |
| POST | `/api/recordings/{id}/publish` | Опубликовать |
| DELETE | `/api/recordings/{id}` | Удалить |

### Качество чтецов

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/reader-quality/rate` | Оценить чтеца |
| GET | `/api/reader-quality/top` | Топ чтецов |
| GET | `/api/reader-quality/profile/{userId}` | Профиль чтеца |

## Таблицы базы данных

```sql
-- Сессии чтения
reading_sessions (
  id uuid PRIMARY KEY,
  club_id uuid REFERENCES clubs(id),
  book_id uuid REFERENCES books(id),
  reader_id uuid REFERENCES users(id),
  chapter integer,
  status text DEFAULT 'idle',
  started_at timestamp,
  ended_at timestamp,
  recording_id uuid,
  created_at timestamp DEFAULT now()
);

-- Записи
recordings (
  id uuid PRIMARY KEY,
  session_id uuid REFERENCES reading_sessions(id),
  title text NOT NULL,
  duration integer,
  file_url text,
  file_size integer,
  status text DEFAULT 'recording',
  published_at timestamp,
  created_at timestamp DEFAULT now()
);

-- Оценки чтецов
reader_quality_ratings (
  id uuid PRIMARY KEY,
  recording_id uuid REFERENCES recordings(id),
  rater_id uuid REFERENCES users(id),
  clarity integer,
  pace integer,
  expression integer,
  pronunciation integer,
  overall integer,
  comment text,
  created_at timestamp DEFAULT now()
);

-- Статистика чтецов
reader_quality_stats (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  average_clarity decimal,
  average_pace decimal,
  average_expression decimal,
  average_pronunciation decimal,
  average_overall decimal,
  total_sessions integer DEFAULT 0,
  total_listeners integer DEFAULT 0,
  updated_at timestamp DEFAULT now()
);
```

## Мониторинг

### Метрики

- Активных сессий
- Слушателей в реальном времени
- Длительность сессий
- Качество записей
- Рейтинг чтецов

### Алерты

- Падение качества потока
- Ошибки Icecast
- Превышение лимитов слушателей
- Проблемы с записью