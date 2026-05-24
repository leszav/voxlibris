# Фаза 7 — Запись аудио ✅

## Обзор

Фаза 7 реализует систему записи аудиосессий чтения с хранением в MinIO (S3-совместимое хранилище).

## Что было реализовано

### 1. SessionRecordingsRepository (`server/repositories/SessionRecordingsRepository.ts`)

**Основные функции:**
- CRUD для метаданных записей
- Получение записей по сессии, клубу, статусу
- Обновление URL, статуса, качества записей
- Управление доступностью записей
- Статистика записей клуба

**Методы:**
- `createRecording(data)` — создать запись
- `getRecording(id)` — получить по ID
- `getSessionRecordings(sessionId)` — записи сессии
- `getClubRecordings(clubId)` — записи клуба
- `updateRecordingStatus(id, status)` — обновить статус
- `updateRecordingUrl(id, url, key, duration, size)` — обновить URL
- `deleteRecording(id)` — мягкое удаление
- `getClubRecordingsStats(clubId)` — статистика

---

### 2. RecordingService (`server/services/recording-service.ts`)

**Основные функции:**
- Создание записей сессий
- Загрузка аудиофайлов в MinIO
- Генерация подписанных URL для скачивания
- Управление жизненным циклом записей
- Очистка истёкших записей

**Методы:**
- `createRecording(metadata, options)` — создать запись
- `uploadRecordingFile(recordingId, buffer, format)` — загрузить файл
- `getRecording(recordingId)` — получить запись с проверкой доступности
- `getRecordingDownloadUrl(recordingId, expiresIn)` — подписанный URL
- `getSessionRecordings(sessionId)` — записи сессии
- `getClubRecordings(clubId)` — записи клуба
- `deleteRecording(recordingId)` — удалить запись (файл + метаданные)
- `cleanupExpiredRecordings()` — очистить истёкшие записи

---

### 3. API Endpoints (`server/routes/recordings.ts`)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/recordings` | Создать запись |
| GET | `/api/recordings/:id` | Получить запись |
| GET | `/api/recordings/:id/download` | URL для скачивания |
| GET | `/api/sessions/:sessionId/recordings` | Записи сессии |
| GET | `/api/clubs/:clubId/recordings` | Записи клуба |
| GET | `/api/clubs/:clubId/recordings/stats` | Статистика |
| POST | `/api/recordings/:id/upload` | Загрузить файл |
| DELETE | `/api/recordings/:id` | Удалить запись |

---

### 4. Интеграция с MinIO

**Используется существующий fileStorage:**
- S3-совместимое хранилище (MinIO)
- Префикс `recordings/` для организации
- Публичные и подписанные URL
- Автоматическое удаление файлов

**Структура в MinIO:**
```
xlibris-books/
  recordings/
    {clubId}/
      {sessionId}/
        {recordingId}.{format}
```

**Пример ключа:**
```
recordings/club-123/session-456/rec-789.webm
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

## Параметры качества записи

| Параметр | Тип | Описание |
|----------|-----|----------|
| `bitrate` | number | Битрейт в kbps (например: 128, 256) |
| `sampleRate` | number | Частота дискретизации в Hz (44100, 48000) |
| `channels` | number | Количество каналов (1 = mono, 2 = stereo) |
| `format` | string | Формат файла (webm, mp3, wav) |

---

## Управление доступностью

### Параметры:

| Параметр | Тип | Описание |
|----------|-----|----------|
| `isAvailable` | boolean | Доступна ли запись |
| `availableUntil` | Date | Дата окончания доступности (null = бессрочно) |

### Автоматическая проверка:

Метод `getRecording()` автоматически:
- Проверяет `isAvailable`
- Проверяет `availableUntil`
- Если истёк срок — помечает как недоступную

---

## Права доступа

| Действие | Требуемые права |
|----------|-----------------|
| Создать запись | Чтец сессии |
| Загрузить файл | Чтец сессии |
| Получить запись | Любой участник клуба |
| Скачать запись | Любой участник клуба |
| Удалить запись | Чтец, владелец клуба или админ |

---

## Workflow записи

### 1. Создание записи
```typescript
POST /api/recordings
{
  "sessionId": "session-456",
  "clubId": "club-123",
  "format": "webm",
  "bitrate": 128
}

→ { "recordingId": "rec-789" }
```

### 2. Запись аудио (клиентская часть)
- Клиент использует `MediaRecorder` API браузера
- Записывает аудио с WebRTC Producer
- Конвертирует в base64

### 3. Загрузка файла
```typescript
POST /api/recordings/rec-789/upload
{
  "audioData": "base64_encoded_data...",
  "format": "webm"
}

→ { "success": true }
```

### 4. Получение записи
```typescript
GET /api/recordings/rec-789

→ { "recording": { "recordingUrl": "...", "duration": 3600 } }
```

### 5. Скачивание
```typescript
GET /api/recordings/rec-789/download?expiresIn=3600

→ { "url": "https://minio.example.com/..." }
```

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

### Загрузка файла
```bash
curl -X POST http://localhost:5000/api/recordings/rec-789/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "audioData": "$(base64 -w 0 recording.webm)",
    "format": "webm"
  }'
```

### Получение записей клуба
```bash
curl -X GET http://localhost:5000/api/clubs/club-123/recordings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Статистика
```bash
curl -X GET http://localhost:5000/api/clubs/club-123/recordings/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Документация

- [API Записей](./routes/README_RECORDINGS_API.md)
- [File Storage (MinIO)](./file-storage.ts)

---

## Следующие шаги (Frontend)

### Требуется реализовать:

1. **MediaRecorder Service**
   - Запись аудио с WebRTC Producer
   - Конвертация в base64
   - Загрузка на сервер

2. **UI управления записями**
   - Кнопка "Начать запись"
   - Индикатор записи
   - Список записей сессии

3. **Аудио плеер**
   - Воспроизведение записей
   - Управление воспроизведением
   - Скачивание записей

4. **Интеграция с WebRTC**
   - Запись через PipeTransport (опционально для серверной записи)
   - Локальная запись при сбое связи

---

## Статус

**Backend:** ✅ Завершено
**Frontend:** ⏳ Не начато

Прогресс фазы: 100% (только Backend)
