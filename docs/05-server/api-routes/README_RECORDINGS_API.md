# API Записей Сессий

Базовый путь: `/api/recordings`

Все endpoints требуют JWT аутентификации (middleware `jwtAuth`).

## Endpoints

### Создать запись
**POST** `/api/recordings`

Создаёт новую запись сессии чтения.

**Body:**
```json
{
  "sessionId": "string",
  "clubId": "string",
  "title": "string (optional)",
  "format": "webm | mp3 | wav (optional)",
  "bitrate": 128,
  "sampleRate": 48000,
  "channels": 2
}
```

**Response:**
```json
{
  "success": true,
  "recordingId": "string",
  "sessionId": "string"
}
```

**Ограничения:**
- Только чтец сессии может создавать записи

---

### Получить запись по ID
**GET** `/api/recordings/:id`

Возвращает детали записи по её ID.

**Response:**
```json
{
  "success": true,
  "recording": {
    "id": "string",
    "sessionId": "string",
    "clubId": "string",
    "recordingUrl": "string",
    "storageKey": "string",
    "duration": 3600,
    "fileSize": 5242880,
    "format": "webm",
    "status": "ready",
    "bitrate": 128,
    "sampleRate": 48000,
    "channels": 2,
    "isAvailable": true,
    "availableUntil": "2025-03-01T00:00:00Z",
    "available": true
  }
}
```

---

### Получить URL для скачивания
**GET** `/api/recordings/:id/download?expiresIn=3600`

Генерирует подписанный URL для скачивания записи.

**Query Parameters:**
- `expiresIn` — время действия URL в секундах (по умолчанию 3600)

**Response:**
```json
{
  "success": true,
  "url": "https://minio.example.com/bucket/recordings/...",
  "expiresIn": 3600
}
```

---

### Получить записи сессии
**GET** `/api/sessions/:sessionId/recordings`

Возвращает все записи указанной сессии.

**Response:**
```json
{
  "success": true,
  "recordings": [ ... ]
}
```

---

### Получить записи клуба
**GET** `/api/clubs/:clubId/recordings?availableOnly=true`

Возвращает все записи клуба.

**Query Parameters:**
- `availableOnly` — только доступные записи (по умолчанию `true`)

**Response:**
```json
{
  "success": true,
  "recordings": [ ... ]
}
```

---

### Получить статистику записей клуба
**GET** `/api/clubs/:clubId/recordings/stats`

Возвращает статистику записей клуба.

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 10,
    "ready": 8,
    "processing": 1,
    "failed": 1,
    "totalDuration": 36000,
    "totalSize": 52428800
  }
}
```

---

### Загрузить аудиофайл записи
**POST** `/api/recordings/:id/upload`

Загружает аудиофайл для записи в хранилище MinIO.

**Body:**
```json
{
  "audioData": "base64_encoded_audio_data",
  "format": "webm"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Recording uploaded successfully"
}
```

**Ограничения:**
- Только чтец сессии может загружать записи
- Файл конвертируется из base64 в Buffer перед загрузкой

---

### Удалить запись
**DELETE** `/api/recordings/:id`

Удаляет запись из БД и файла из хранилища.

**Ограничения:**
- Чтец сессии, владелец клуба или администратор

**Response:**
```json
{
  "success": true,
  "message": "Recording deleted successfully"
}
```

---

## Статусы записей

| Статус | Описание |
|--------|----------|
| `processing` | Запись обрабатывается |
| `ready` | Запись готова к воспроизведению |
| `failed` | Ошибка при создании записи |
| `deleted` | Запись удалена |

---

## Хранение файлов

### Структура в MinIO

```
xlibris-books/
  recordings/
    {clubId}/
      {sessionId}/
        {recordingId}.{format}
```

### Пример ключа:
```
recordings/club-123/session-456/rec-789.webm
```

---

## Параметры качества записи

| Параметр | Тип | Описание |
|----------|-----|----------|
| `bitrate` | number | Битрейт в kbps (например: 128, 256) |
| `sampleRate` | number | Частота дискретизации в Hz (например: 44100, 48000) |
| `channels` | number | Количество каналов (1 = mono, 2 = stereo) |
| `format` | string | Формат файла (webm, mp3, wav) |

---

## Управление доступностью

### Параметры:

| Параметр | Тип | Описание |
|----------|-----|----------|
| `isAvailable` | boolean | Доступна ли запись |
| `availableUntil` | Date | Дата окончания доступности (null = бессрочно) |

### Автоматическая очистка:

Планировщик проверяет записи с истёкшим сроком доступности и помечает их как недоступные.

---

## Примеры использования

### Создание записи
```bash
curl -X POST http://localhost:5000/api/recordings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-456",
    "clubId": "club-123",
    "title": "Вечернее чтение — Глава 1",
    "format": "webm",
    "bitrate": 128
  }'
```

### Загрузка аудиофайла
```bash
curl -X POST http://localhost:5000/api/recordings/rec-789/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "audioData": "base64_encoded_data...",
    "format": "webm"
  }'
```

### Получение записи
```bash
curl -X GET http://localhost:5000/api/recordings/rec-789 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Получение URL для скачивания
```bash
curl -X GET "http://localhost:5000/api/recordings/rec-789/download?expiresIn=7200" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Получение записей клуба
```bash
curl -X GET http://localhost:5000/api/clubs/club-123/recordings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Удаление записи
```bash
curl -X DELETE http://localhost:5000/api/recordings/rec-789 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Интеграция с WebRTC

Запись через WebRTC (mediasoup) должна быть реализована на клиентской стороне:

1. **На клиенте:**
   - Использовать `MediaRecorder` API браузера
   - Записывать аудио с WebRTC Producer
   - Конвертировать в base64 и отправлять на сервер

2. **На сервере:**
   - Создать запись через `POST /api/recordings`
   - Получить `recordingId`
   - Загрузить аудиофайл через `POST /api/recordings/:id/upload`

3. **Хранение:**
   - Файл сохраняется в MinIO с ключом `recordings/{clubId}/{sessionId}/{recordingId}.{format}`
   - URL доступен через `GET /api/recordings/:id/download`

---

## Связанные таблицы БД

- `session_recordings` — Основная таблица записей
- `reading_sessions` — Сессии чтения
- `clubs` — Клубы
- `users` — Пользователи (чтецы)
