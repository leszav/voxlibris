# Миграция useAudioStream: Icecast → WebRTC/mediasoup

**Дата:** 2026-06-12 | **Статус:** Draft | **Reference ветка:** `dev_08.02.26`

---

## 1. Контекст

Текущий transport layer Studio построен на Icecast. При возврате к WebRTC нужно заменить transport, сохранив transport-agnostic UI/orchestration. Историческая WebRTC-реализация в `dev_08.02.26` содержит серверный mediasoup-контур (8 файлов), но не содержит клиентского signaling gateway.

---

## 2. Что меняется, а что нет

### Не меняется (transport-agnostic, ~84%)

- Все 17 UI-компонентов `components/studio/`
- `hooks/use-studio-mode.ts` — оркестратор
- `hooks/use-studio-device-eligibility.ts`, `use-live-readers.ts`
- Все view-хелперы: `studio-mode-state.ts`, `studio-session-phase.ts`, `studio-session-summary.ts`, `studio-mic-check-*.ts`, `reader-studio-view.ts`, `studio-prep-view.tsx`
- `components/reader/ClubReader.tsx` — embedded Studio
- Серверные: `studio-streaming-service.ts`, `studio-recording-storage.ts`, `studio-stream-intent-store.ts`, `recording-service.ts`

### Меняется (transport-specific, ~16%)

**Клиент — замена (5 файлов):**

| Текущий (Icecast) | Новый (WebRTC) | Действие |
|---|---|---|
| `lib/studio-streaming-gateway.ts` | `lib/webrtc-signaling-gateway.ts` | Переписать: fetch duplex → Socket.IO |
| `lib/studio-streaming-body.ts` | — | Удалить |
| `lib/studio-streaming.ts` | `lib/webrtc-connection.ts` | Переписать |
| `lib/studio-streaming-errors.ts` | `lib/webrtc-connection-errors.ts` | Переписать |
| `hooks/use-audio-stream.ts` | `hooks/use-audio-stream.ts` | Переписать `startStreamingTransport()` |

**Клиент — адаптация (2 файла):**

| Файл | Изменение |
|---|---|
| `hooks/use-icecast-player.ts` | Заменить на `use-webrtc-player.ts` |
| `hooks/use-club-live-listening.ts` | Адаптировать: poll → signaling |

**Сервер — замена (1 файл):**

| Текущий | Новый | Действие |
|---|---|---|
| `routes/studio-stream.ts` (460 строк) | `routes/webrtc-signaling.ts` | Переписать |

**Сервер — адаптация (1 файл):**

| Файл | Изменение |
|---|---|
| `lib/studio-streaming-state.ts` | mountPath → transportId/roomId |

**Сервер — новые файлы (из `dev_08.02.26`, адаптировать):**

| Файл | Назначение |
|---|---|
| `server/webrtc/types.ts` | Типы mediasoup |
| `server/webrtc/mediasoup-config.ts` | Worker/codecs/ICE config |
| `server/webrtc/mediasoup-manager.ts` | Worker + router lifecycle |
| `server/webrtc/room-manager.ts` | Room/peer/transport/producer/consumer |
| `server/webrtc/webrtc-handler.ts` | Socket.IO signaling handler |
| `server/services/reading-session-webrtc.ts` | Bridge session↔room |

---

## 3. Детальный план по файлам

### 3.1. `hooks/use-audio-stream.ts` — ядро миграции

Текущий хук (532 строки) уже имеет transport-agnostic интерфейс:

```typescript
interface AudioStreamState {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  mute: (muted: boolean) => void;
  status: 'idle' | 'connecting' | 'streaming' | 'paused' | 'error' | 'stopped';
  error: string | null;
  mediaStream: MediaStream | null;
  recordingBlob: Blob | null;
}
```

**Что переиспользуется без изменений:**
- `requestStudioMicrophoneStream()` — захват микрофона (browser API)
- `getStudioAudioMimeType()` — MIME-тип (browser API)
- `createStudioLocalRecorder()` — локальная запись (browser API)
- `createStudioRecordingBlob()` — blob assembly
- `bindStudioMicrophoneEnded()` — мониторинг трека
- Вся логика mute/pause/resume/stop на уровне статуса
- VU-метрика через `useRealVUMeter`

**Что переписывается — `startStreamingTransport()`:**

Текущая реализация (Icecast):
```typescript
// 1. Создаём ReadableStream
const { body: readable } = createStudioStreamingBody(onControllerChange);
// 2. MediaRecorder → chunks → ReadableStream
const streamRecorder = createStudioStreamRecorder({ stream, mimeType, onChunk });
// 3. fetch POST (long-running duplex request)
const response = await startStudioStreamIngest({ sessionId, mimeType, body: readable, signal });
// 4. Ждём подтверждения mount на Icecast
await waitForStudioStreamReady(sessionId, signal, getError);
updateStatus('streaming');
```

Новая реализация (WebRTC):
```typescript
// 1. Получаем router RTP capabilities
const rtpCapabilities = await getRouterRtpCapabilities(sessionId);
// 2. Создаём send transport
const sendTransport = await createSendTransport(sessionId, rtpCapabilities);
// 3. Подключаем transport (DTLS handshake)
await connectSendTransport(sendTransport, dtlsParameters);
// 4. Producer: добавляем audio track в transport
const producer = await produceAudio(sendTransport, stream.getAudioTracks()[0]);
// 5. Статус → streaming
updateStatus('streaming');
```

**Что переписывается — `pause()` / `resume()`:**

Текущая реализация (Icecast):
```typescript
pause: stopStreamingTransport() + updateStatus('paused')
resume: startStreamingTransport(stream, mimeType) — пересоздаёт fetch
```

Новая реализация (WebRTC):
```typescript
pause: producer.pause() — сервер уведомляется через signaling
resume: producer.resume() — сервер уведомляется через signaling
```

Ключевое отличие: при WebRTC pause/resume не требует пересоздания соединения. Producer просто ставится на паузу, audio track перестаёт отправляться, но DTLS/WebRTC transport остаётся активным.

**Что переписывается — `stop()`:**

Текущая: `stopStreamingTransport()` → abort fetch → cleanup  
Новая: `producer.close()` → `sendTransport.close()` → signaling `close-producer`

### 3.2. Клиентский signaling gateway (новый файл)

`lib/webrtc-signaling-gateway.ts` — замена `studio-streaming-gateway.ts`.

Интерфейс:
```typescript
interface WebRTCSignalingGateway {
  getRouterRtpCapabilities(sessionId: string): Promise<RtpCapabilities>;
  createTransport(sessionId: string, type: 'send' | 'recv'): Promise<TransportOptions>;
  connectTransport(transportId: string, dtlsParameters: DtlsParameters): Promise<void>;
  produce(transportId: string, kind: 'audio', rtpParameters: RtpParameters): Promise<string>;
  consume(transportId: string, producerId: string, rtpCapabilities: RtpCapabilities): Promise<ConsumerOptions>;
  pauseProducer(producerId: string): Promise<void>;
  resumeProducer(producerId: string): Promise<void>;
  closeProducer(producerId: string): Promise<void>;
}
```

Реализация: Socket.IO events через существующий `socket-registry.ts` → `getIO()`.

### 3.3. Клиентский WebRTC player (новый файл)

`hooks/use-webrtc-player.ts` — замена `use-icecast-player.ts`.

Интерфейс (аналогичный текущему):
```typescript
interface WebRTCPlayerState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  error: string | null;
  volume: number;
  isMuted: boolean;
}
interface WebRTCPlayerControls {
  play: () => void;
  pause: () => void;
  stop: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}
```

Реализация:
1. Получить `routerRtpCapabilities` от сервера
2. Создать recv transport через signaling
3. Подключить transport (DTLS)
4. Consume audio producer чтеца
5. Воспроизвести consumer track через `<audio>` или `AudioContext`

### 3.4. Серверный signaling route (новый файл)

`routes/webrtc-signaling.ts` — замена `routes/studio-stream.ts`.

Эндпоинты (REST + Socket.IO):

**REST (JWT auth):**
- `GET /api/webrtc/rooms` — список активных комнат
- `POST /api/webrtc/rooms` — создать комнату для reading session
- `DELETE /api/webrtc/rooms/:id` — закрыть комнату
- `GET /api/webrtc/rooms/:id/peers` — список пиров
- `GET /api/webrtc/stats` — статистика

**Socket.IO (через `webrtc-handler.ts`):**
- `create-room` → создание mediasoup router + room
- `join-room` → добавление пира (reader/listener)
- `leave-room` → удаление пира
- `create-transport` → создание WebRTC transport (send/recv)
- `connect-transport` → DTLS handshake
- `produce` → добавление audio track (reader)
- `consume` → подписка на audio track (listener)
- `pause-producer` / `resume-producer` → пауза/возобновление
- `close-producer` / `close-consumer` → закрытие

### 3.5. Адаптация `use-club-live-listening.ts`

Текущий flow:
```
poll /api/studio/stream/:sessionId/status (каждые 2с)
  → получить streamUrl
    → primeIcecastPlayback(streamUrl)
```

Новый flow:
```
signaling: consume(sessionId, producerId)
  → получить consumer rtpParameters
    → RTCPeerConnection.addTrack()
      → audio.play()
```

Ключевое изменение: вместо HTTP polling — WebRTC signaling через Socket.IO. Синхронизация позиции чтения (WebSocket) **переиспользуется как есть**.

---

## 4. Порядок реализации (Phases)

### Phase 1: Серверный mediasoup foundation

**Цель:** mediasoup worker + router + room management работают на сервере.

1. Адаптировать из `dev_08.02.26`:
   - `server/webrtc/types.ts` — убрать video/data типы, оставить audio-only
   - `server/webrtc/mediasoup-config.ts` — обновить порты, codecs (только Opus)
   - `server/webrtc/mediasoup-manager.ts` — singleton worker/router
   - `server/webrtc/room-manager.ts` — room/peer/transport/producer/consumer

2. Создать `server/webrtc/webrtc-handler.ts` — Socket.IO handler

3. Создать `server/routes/webrtc-signaling.ts` — REST endpoints

4. Интегрировать с `server/index.ts` — подключить routes + Socket.IO handler

5. Создать `server/services/reading-session-webrtc.ts` — bridge session↔room

**Валидация:** `pnpm run check`, ручной тест через Socket.IO client

### Phase 2: Клиентский signaling gateway

**Цель:** клиент может обмениваться signaling messages с сервером.

1. Создать `lib/webrtc-connection.ts` — URL-ы и типы
2. Создать `lib/webrtc-signaling-gateway.ts` — Socket.IO signaling
3. Создать `lib/webrtc-connection-errors.ts` — маппинг ошибок

**Валидация:** `pnpm run check`, unit-тесты signaling gateway

### Phase 3: Reader transport migration

**Цель:** чтец стримит через WebRTC вместо Icecast.

1. Переписать `startStreamingTransport()` в `hooks/use-audio-stream.ts`:
   - Убрать: `createStudioStreamingBody`, `createStudioStreamRecorder`, `startStudioStreamIngest`, `waitForStudioStreamReady`
   - Добавить: `getRouterRtpCapabilities`, `createSendTransport`, `connectTransport`, `produce`
2. Переписать `pause()` / `resume()`:
   - Убрать: `stopStreamingTransport()` + пересоздание fetch
   - Добавить: `producer.pause()` / `producer.resume()`
3. Переписать `stop()`:
   - Убрать: abort fetch
   - Добавить: `producer.close()` + `sendTransport.close()`
4. Удалить `lib/studio-streaming-body.ts`
5. Удалить `lib/studio-streaming-gateway.ts`
6. Заменить `lib/studio-streaming.ts` → `lib/webrtc-connection.ts`
7. Заменить `lib/studio-streaming-errors.ts` → `lib/webrtc-connection-errors.ts`

**Валидация:** ручной E2E тест: чтец запускает эфир → audio producer создаётся → сервер подтверждает

### Phase 4: Listener transport migration

**Цель:** слушатель подключается к WebRTC вместо Icecast.

1. Создать `hooks/use-webrtc-player.ts` — замена `use-icecast-player.ts`
2. Адаптировать `hooks/use-club-live-listening.ts`:
   - Убрать: poll status + `primeIcecastPlayback`
   - Добавить: signaling consume + WebRTC playback
3. Адаптировать `lib/studio-streaming-state.ts`:
   - Заменить `mountPath` на `roomId` / `transportId`
4. Обновить `lib/studio-streaming-service.ts`:
   - `buildStudioStreamStatus()` — возвращать WebRTC connection info вместо Icecast streamUrl

**Валидация:** ручной E2E тест: listener подключается → слышит чтеца → пауза/возобновление работают

### Phase 5: Recording pipeline

**Цель:** запись эфиров работает через WebRTC.

Варианты:
1. **Server-side recording** — mediasoup PlainTransport → ffmpeg → файл (из `dev_08.02.26`: `createPlainTransport()`)
2. **Client-side recording** — локальный MediaRecorder (уже реализован в `use-audio-stream.ts`, переиспользуется)
3. **Комбинация** — client-side для immediate access + server-side для redundancy

Рекомендация: начать с client-side recording (уже работает), server-side добавить позже.

**Валидация:** запись появляется в `/admin/recordings` после завершения эфира

### Phase 6: Cleanup

1. Удалить `routes/studio-stream.ts` (Icecast proxy)
2. Удалить `lib/studio-streaming-body.ts`
3. Удалить `lib/studio-streaming-gateway.ts`
4. Удалить `hooks/use-icecast-player.ts`
5. Удалить страницу `pages/reader-studio.tsx` (нерелевантна, дублирует embedded)
6. Убрать маршрут `/studio/:clubId/:bookId/:chapter?` из `App.tsx`
7. Обновить документацию в `docs/vlstudio/`

---

## 5. Риски и митигация

| Риск | Описание | Митигация |
|---|---|---|
| **Инфраструктура** | mediasoup требует UDP, отдельного процесса, сетевой конфигурации (`MEDIASOUP_ANNOUNCED_IP`) | Подготовить infra-план до начала Phase 1. Проверить UDP на deploy-сервере |
| **Pause semantics** | Icecast: stop ingest + buffer decay. WebRTC: producer.pause() — мгновенно, но listener видит паузу иначе | Протестировать UX паузы. Возможно, потребуется UI-адаптация |
| **Latency change** | Icecast ~10–15с → WebRTC ~100–500мс. UX-ожидания слушателей изменятся | Позитивный риск. Обновить документацию по ожидаемой задержке |
| **Recording pipeline** | Server-side recording через PlainTransport требует отдельной настройки | Начать с client-side recording, server-side добавить в Phase 5 |
| **In-memory state** | `RoomManager` хранит rooms/transports/producers в памяти (как и текущий `activeStreams`) | Для MVP допустимо. Для scale — миграция на Redis (отдельный трек) |
| **Клиентский signaling не существовал** | В `dev_08.02.26` нет клиентского WebRTC-кода | Писать с нуля, опираясь на серверные типы из `types.ts` |
| **Browser compatibility** | WebRTC audio-only поддерживается во всех современных браузерах | ТЗ ограничивает desktop Chrome 105+ — покрыто |

---

## 6. Критерии успеха

- [ ] Чтец запускает эфир через embedded Studio в клубном ридере
- [ ] Audio producer создаётся через mediasoup, audio track доставляется слушателю
- [ ] Слушатель подключается и слышит чтеца с задержкой ~100–500мс
- [ ] Пауза/возобновление работают без пересоздания соединения
- [ ] Mute/unmute работает без влияния на WebRTC transport
- [ ] Запись эфира сохраняется (client-side recording)
- [ ] Синхронизация позиции чтения чтец→слушатель работает через WebSocket (без изменений)
- [ ] `pnpm run check` — зелёный
- [ ] Встроенный Studio в `ClubReader.tsx` работает без изменений в UI-слое
- [ ] Страница `reader-studio.tsx` удалена, маршрут убран из `App.tsx`

---

## 7. Prerequisites (до начала Phase 1)

1. **Инфраструктурная проверка:**
   - UDP-порты доступны на deploy-сервере (mediasoup: 10000–20000)
   - `MEDIASOUP_ANNOUNCED_IP` настроен для NAT traversal
   - mediasoup npm-пакет совместим с текущей Node.js версией

2. **Документация:**
   - Прочитать `docs/vlstudio/VLSTUDIO_ICECAST_DECISION_AND_WEBRTC_RETURN_2026-04-28.md` — убедиться, что условия возврата выполнены
   - Изучить полный код в `dev_08.02.26` через `git show dev_08.02.26:<path>`

3. **Согласование:**
   - Подтвердить с командой, что WebRTC return — приоритетный трек
   - Определить timeline для infra-подготовки

---

## 8. Связанные документы

- [Icecast baseline](./VLSTUDIO_ICECAST_BASELINE_2026-04-28.md) — текущий стабильный контур
- [WebRTC return трек](./VLSTUDIO_ICECAST_DECISION_AND_WEBRTC_RETURN_2026-04-28.md) — обоснование и условия
- [Аудит Studio](./vlstudio-audit-2026-04-24.md) — полный аудит архитектуры
- [Контрольная точка](./vlstudio-checkpoint-2026-04-24-baseline.md) — baseline перед доработкой
