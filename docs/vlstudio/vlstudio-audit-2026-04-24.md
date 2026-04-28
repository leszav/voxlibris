# Аудит текущей реализации VoxLibris Studio

Дата: 2026-04-24

> Статус: исторический аудит и архитектурный контекст.
> 
> Он остаётся полезным для понимания общей картины Studio, но текущая pragmatic execution-стратегия по live-контуру зафиксирована в новых документах:
> - [Icecast roadmap](./VLSTUDIO_ICECAST_ROADMAP_2026-04-28.md)
> - [Icecast baseline](./VLSTUDIO_ICECAST_BASELINE_2026-04-28.md)
> - [Icecast decision / WebRTC return](./VLSTUDIO_ICECAST_DECISION_AND_WEBRTC_RETURN_2026-04-28.md)

## 1. Цель аудита

Понять:

- что уже реализовано в VoxLibris Studio и связанных live-сценариях;
- чего не хватает относительно концепции;
- какие архитектурные риски есть для надежности эфира;
- насколько текущий стек подходит для роста до 2000+ одновременных эфиров;
- нужен ли OpenStudio как основа решения.

## 2. Краткий вывод

Текущая реализация — это не пустой прототип, а рабочий MVP live-чтения с двумя слоями:

1. отдельная страница Studio;
2. встроенный studio-mode внутри клубного ридера.

Ключевой продуктовый факт: сценарий, близкий к целевому пользовательскому поведению, уже в основном строится не вокруг отдельной страницы Studio, а вокруг встраивания Studio в клубный ридер.

### Что можно считать уже реализованным

- старт live-эфира чтеца из UI;
- передача голоса в Icecast через серверный proxy route;
- базовая проверка микрофона;
- VU-meter и mute/pause/resume/end;
- запись эфира на сервер в `uploads/recordings`;
- отображение активных чтецов в клубе;
- подключение слушателя к live-потоку;
- синхронизация позиции чтения от чтеца к слушателю;
- предложение перейти к позиции чтеца после завершения прослушивания;
- Redis-store активных live-сессий с heartbeat TTL.

### Что еще не дотягивает до полнофункционального решения

- Studio UI пока не индустриального уровня;
- отдельная страница Studio и встроенный studio-mode дублируют логику;
- нет цельной продуктовой модели `OFFLINE / LIVE / PAUSED / ENDING / SUMMARY`;
- нет качественно завершенного summary-flow после эфира;
- реакции/вопросы/мини-чат существуют в схеме и websocket-контуре, но не доведены до ключевого UX-сценария;
- отсутствует завершенная модель надежности эфира для production-scale;
- текущая серверная схема стриминга не выглядит готовой к 2000+ одновременных эфиров на одном инстансе приложения.

### Главный архитектурный вывод

Для VoxLibris Studio логичнее развивать собственную продуктовую оболочку вокруг:

- клубного/персонального ридера;
- Icecast как delivery-слоя для слушателей;
- отдельного session/live state слоя;
- возможно отдельного streaming-gateway.

OpenStudio можно рассматривать только как источник идей или отдельных паттернов. Использовать его как ядро продукта в текущей задаче не выглядит оптимальным.

## 3. Что уже реализовано

### 3.1. Встроенный studio-mode внутри клубного ридера

Реализация встроена в [ClubReader](/home/odmen/DEV/voxlibris/client/src/components/reader/ClubReader.tsx#L137-L210) и UI-секции [ниже по файлу](/home/odmen/DEV/voxlibris/client/src/components/reader/ClubReader.tsx#L835-L1064).

Уже есть:

- плавающий пузырь "начать читать" — [ReadNowBubble](/home/odmen/DEV/voxlibris/client/src/components/studio/ReadNowBubble.tsx#L1-L38);
- пузырь активных чтецов — [LiveReadersBubble](/home/odmen/DEV/voxlibris/client/src/components/studio/LiveReadersBubble.tsx#L14-L87);
- модалка списка активных чтецов с play/stop — [ActiveReadersModal](/home/odmen/DEV/voxlibris/client/src/components/studio/LiveReadersBubble.tsx#L89-L181);
- overlay для слушателя поверх ридера — [ListenerOverlay](/home/odmen/DEV/voxlibris/client/src/components/studio/ListenerOverlay.tsx#L35-L164);
- встраивание top bar/control bar/mic check в сам ридер — [ClubReader](/home/odmen/DEV/voxlibris/client/src/components/reader/ClubReader.tsx#L835-L1064).

Это уже очень близко к твоему описанию:

- чтец нажимает пузырь с микрофоном;
- открывает Studio поверх reader-контекста;
- может читать с текущей позиции;
- слушатель видит bubble активных чтецов;
- слушатель выбирает чтеца из модалки;
- reader у слушателя заблюрен, показывается слушательский overlay;
- после остановки можно предложить переход к позиции чтеца.

### 3.2. Аудиостриминг чтеца в Icecast

Клиентский хук: [useAudioStream](/home/odmen/DEV/voxlibris/client/src/hooks/use-audio-stream.ts#L1-L385)

Что делает:

- берет микрофон через `getUserMedia`;
- включает browser-side audio constraints:
  - `echoCancellation`
  - `noiseSuppression`
  - `autoGainControl`
- пишет голос через `MediaRecorder`;
- стримит chunks в `POST /api/studio/stream/:sessionId` long-running запросом.

Серверный proxy route: [server/routes/studio-stream.ts](/home/odmen/DEV/voxlibris/server/routes/studio-stream.ts#L1-L305)

Что делает:

- принимает браузерный поток `audio/webm` / `audio/ogg`;
- пропускает через `ffmpeg`;
- перекодирует в MP3;
- делает `PUT` в Icecast mountpoint `/live/:sessionId`;
- параллельно пишет mp3-файл записи эфира на диск.

Это уже рабочий end-to-end live broadcast pipeline.

### 3.3. Список активных чтецов и live-presence

Клиентский слой: [useLiveReaders](/home/odmen/DEV/voxlibris/client/src/hooks/use-live-readers.ts#L1-L267)

Серверный websocket: [server/websocket-reader.ts](/home/odmen/DEV/voxlibris/server/websocket-reader.ts#L404-L518)

REST fallback/source of truth: [GET /api/clubs/:clubId/live-readers](/home/odmen/DEV/voxlibris/server/club-routes.ts#L1160-L1181)

Серверное хранилище live-сессий: [server/lib/live-sessions-store.ts](/home/odmen/DEV/voxlibris/server/lib/live-sessions-store.ts#L1-L114)

Плюсы текущего решения:

- активные live-сессии вынесены в Redis;
- состояние не зависит напрямую от опроса Icecast admin endpoint;
- есть heartbeat TTL;
- при disconnect чтец очищается из store;
- у слушателей есть и websocket-уведомления, и REST-снимок состояния.

Это хорошая база.

### 3.4. Синхронизация позиции чтения

Есть broadcast позиции чтеца слушателям:

- отправка позиции из reader при live-чтении — [ClubReader](/home/odmen/DEV/voxlibris/client/src/components/reader/ClubReader.tsx#L228-L237) и [scroll debounce](/home/odmen/DEV/voxlibris/client/src/components/reader/ClubReader.tsx#L931-L944);
- прием позиции у слушателя — [useLiveReaders](/home/odmen/DEV/voxlibris/client/src/hooks/use-live-readers.ts#L190-L194);
- применение позиции к ридеру слушателя — [ClubReader](/home/odmen/DEV/voxlibris/client/src/components/reader/ClubReader.tsx#L126-L151);
- предложение перейти к позиции после окончания прослушивания — [ClubReader](/home/odmen/DEV/voxlibris/client/src/components/reader/ClubReader.tsx#L656-L668).

Это прямо соответствует твоей идее про переход к новой позиции чтения.

### 3.5. Базовые сущности данных для Studio

В схеме уже есть:

- `clubReadingStatus` — [schema](/home/odmen/DEV/voxlibris/shared/schema.ts#L1365-L1391)
- `sessionReactions` — [schema](/home/odmen/DEV/voxlibris/shared/schema.ts#L1393-L1405)
- `sessionQuestions` — [schema](/home/odmen/DEV/voxlibris/shared/schema.ts#L1407-L1417)
- `sessionAnalytics` — [schema](/home/odmen/DEV/voxlibris/shared/schema.ts#L1419-L1458)
- монетизационные таблицы — [schema](/home/odmen/DEV/voxlibris/shared/schema.ts#L1464-L1582)

То есть фундамент для расширения уже заложен.

## 4. Что реализовано частично или с расхождением

### 4.1. Два параллельных продукта Studio

Сейчас есть:

- отдельная страница Studio — [reader-studio.tsx](/home/odmen/DEV/voxlibris/client/src/pages/reader-studio.tsx#L1-L586)
- встроенный studio-mode внутри reader — [ClubReader](/home/odmen/DEV/voxlibris/client/src/components/reader/ClubReader.tsx#L835-L1064)

Проблема:

- логика сильно дублируется;
- UI расходится;
- часть сценариев уже лучше решена во встроенном варианте;
- отдельная страница выглядит как старый слой MVP, а не как итоговая целевая форма.

Вывод:

**истинным направлением продукта сейчас выглядит встроенная Studio внутри reader**, а не отдельная страница.

### 4.2. Состояния Studio не закрыты как продукт

В концепте есть:

- OFFLINE
- LIVE
- PAUSED
- ENDING
- SUMMARY

В коде по факту есть только:

- `prep`
- `live`
- `paused`

См. [useStudioMode](/home/odmen/DEV/voxlibris/client/src/hooks/use-studio-mode.ts#L25-L50) и [reader-studio.tsx](/home/odmen/DEV/voxlibris/client/src/pages/reader-studio.tsx#L318-L326).

Отсутствует:

- явное подтверждение завершения эфира;
- экран/панель итогов сессии;
- целостный post-session flow.

### 4.3. Реакции, вопросы, мини-чат не доведены до UX-сценария

Серверные контуры есть:

- реакции/вопросы в websocket — [server/websocket/reading-sessions.ts](/home/odmen/DEV/voxlibris/server/websocket/reading-sessions.ts#L248-L358)
- сущности в схеме — [shared/schema.ts](/home/odmen/DEV/voxlibris/shared/schema.ts#L1393-L1458)

Но в текущем основном UX встроенной Studio:

- нет готовой панели вопросов чтецу;
- нет мягкой ленты реакций как важной части live-опыта;
- нет рабочего, неотвлекающего “pause mode” для обработки вопросов;
- нет цельной интеграции с клубным чатом в логике эфира.

### 4.4. UI Studio пока не выглядит профессиональным production-workbench

Проблемы по текущему UI:

- top bar и control bar полезны, но пока визуально ближе к admin/MVP-интерфейсу;
- prep-state внутри ридера решен функционально, но не как полноценное рабочее место чтеца;
- не хватает четкой композиции: текст как главный объект, эфир как вспомогательный, но всегда читаемый control surface;
- модалка слушателя и bubbles уже неплохие, но еще не выстроены в единую зрелую систему взаимодействия.

### 4.5. Отдельная страница reader-studio перегружена

Файл [client/src/pages/reader-studio.tsx](/home/odmen/DEV/voxlibris/client/src/pages/reader-studio.tsx#L1-L586) содержит слишком много обязанностей:

- инициализация сессии;
- управление микрофоном;
- запуск стрима;
- загрузка/удаление контента;
- overlay-логика;
- stage/settings/control coordination.

Для долгосрочной поддержки это плохой знак. Если этот маршрут сохранять, его почти точно надо декомпозировать.

## 5. Что отсутствует относительно целевого концепта

### 5.1. Полноценный workflow чтеца как главного интерфейса

Нужно довести:

- открытие Studio как основного рабочего режима чтеца;
- явную подготовку к эфиру с текущей позицией и удобным выбором другой позиции;
- уверенную индикацию, что идет именно live-broadcast;
- безопасное завершение эфира с подтверждением;
- экран итогов после завершения.

### 5.2. Автоматическая и ручная аудио-настройка более высокого класса

Сейчас есть только browser constraints:

- echo cancellation
- noise suppression
- auto gain control

Это хорошая базовая автоматизация, но пока нет:

- реального EQ pipeline;
- ручных advanced audio controls;
- профилей качества;
- измеряемой диагностики качества входного сигнала;
- продуманной стратегии fallback при деградации канала.

### 5.3. Reader-first professional UX для чтеца

Не хватает:

- более зрелого режима чтения текста в эфире;
- опциональной телесуфлерной логики;
- быстрого возврата на текущую позицию;
- явных chapter bookmarks/marks во время live-сессии;
- стабильного рабочего right-panel/side-panel сценария.

### 5.4. Итоги сессии и аналитика в UX

Несмотря на наличие backend-сервиса аналитики:

- summary-экран не доведен в Studio UX;
- нет рабочего завершенного пользовательского сценария “эфир закончился -> итоги -> следующее действие”.

### 5.5. Режим обычного клуба vs клуба чтеца

Концептуально ты разделяешь:

- обычный клуб;
- клуб чтеца, где Studio — главный инструмент.

В текущем коде это разделение на UX-уровне почти не выражено.

## 6. Надежность эфира: что хорошо и что опасно

### Уже хорошо

- Icecast используется как delivery для слушателей, а не прямой p2p;
- browser не знает source password;
- есть JWT-protected proxy route — [studio-stream.ts](/home/odmen/DEV/voxlibris/server/routes/studio-stream.ts#L61-L270);
- есть idempotency guard на duplicate start через `activeStreams`;
- есть серверная запись эфира;
- live-presence не завязана на Icecast admin polling;
- Redis TTL + heartbeat — хороший практичный механизм live-state.

### Риски

#### 6.1. Стрим идет через application server + ffmpeg process per live session

Сейчас на каждый эфир создается:

- один долгоживущий HTTP request;
- один `ffmpeg` процесс;
- запись на диск;
- proxy в Icecast.

Это может быть нормально для небольшого и среднего числа эфиров, но для 2000+ одновременных сессий выглядит очень рискованно.

Основные причины:

- огромный рост числа ffmpeg-процессов;
- CPU/IO pressure на app layer;
- память и файловые дескрипторы;
- long-running requests внутри общего backend;
- сложность graceful recovery.

#### 6.2. `activeStreams` хранится в памяти процесса

См. [server/routes/studio-stream.ts](/home/odmen/DEV/voxlibris/server/routes/studio-stream.ts#L41-L42)

Риск:

- в multi-instance deployment это локальное in-memory состояние;
- идемпотентность не гарантируется между инстансами;
- при рестарте процесса информация теряется.

#### 6.3. Listener count / session state контуры выглядят разнородно

Сейчас есть несколько overlapping слоев:

- `useReadingSession`
- `useAudioSession`
- `useLiveReaders`
- websocket reading-sessions
- websocket reader
- Redis live sessions store

Это повышает риск рассинхронизации состояния.

#### 6.4. Browser streaming зависит от `MediaRecorder` + fetch duplex

Это рабочий pragmatic-подход, но для production-scale надо отдельно проверять:

- реальную устойчивость при reconnect;
- поведение при нестабильной сети;
- деградацию chunking/latency;
- контроль задержки старта и хвоста завершения.

#### 6.5. Session analytics service хранит active state в памяти процесса

См. [server/services/session-analytics-service.ts](/home/odmen/DEV/voxlibris/server/services/session-analytics-service.ts#L48-L55)

Риск:

- это не горизонтально-масштабируемый источник истины;
- лимиты `MAX_TRACKED_SESSIONS = 500` и `MAX_LISTENER_EVENTS_PER_SESSION = 2000` уже сами показывают, что сервис не спроектирован под 2000+ одновременных live-сессий как центральный realtime-контур.

## 7. Масштабирование до 2000+ одновременных эфиров

## Оценка текущего состояния

Если речь про **2000+ одновременных broadcast sessions**, то текущая архитектура в нынешнем виде не выглядит готовой.

### Почему

1. `ffmpeg` per session на app-server — слишком дорого.
2. long-lived streaming requests на основном backend — плохая граница масштабирования.
3. in-memory куски session state — непригодны как главный realtime-source в distributed deployment.
4. аналитика и часть сессионной координации не рассчитаны на такой масштаб.

### Что выглядит реалистичным направлением

Для такого масштаба нужен контур вида:

- **frontend app** отдельно;
- **core API** отдельно;
- **stream-ingest gateway** отдельно;
- **Icecast tier** отдельно;
- **Redis / event layer** для live state отдельно;
- возможно **job/event aggregation layer** для analytics отдельно.

### Практический вывод

Текущий стек можно развивать как base для MVP / beta / moderate scale.
Но под 2000+ одновременных эфиров архитектуру придется усиливать почти наверняка.

## 8. OpenStudio: нужен ли он

Внешняя проверка проекта `msitarzewski/openstudio` показывает, что это self-hosted virtual broadcast studio с:

- WebRTC mesh;
- mix-minus;
- multi-host/call-in сценарием;
- Icecast delivery для слушателей.

### Почему это неидеально как ядро VoxLibris Studio

OpenStudio лучше подходит для:

- подкастов;
- community radio;
- multi-host talk rooms;
- guest/caller workflows.

А твоя задача — это прежде всего:

- reader-first interface;
- интеграция с существующим ридером;
- синхронизация позиции чтения;
- массовые независимые live reading sessions внутри продукта;
- специальная логика клуба/клуба чтеца.

### Вывод

OpenStudio **не выглядит лучшим ядром** для VoxLibris Studio.

Его можно использовать как:

- источник UX/аудио-паттернов;
- reference по broadcast-room инженерии;
- опциональный эксперимент для отдельных сценариев клуба чтеца.

Но строить основной продукт вокруг него я бы не рекомендовал.

## 9. Что рекомендовано оставить

- встроенную Studio в `ClubReader` как главное продуктовое направление;
- Icecast как delivery-слой для слушателей;
- Redis TTL store для active live readers;
- позиционную синхронизацию чтец -> слушатель;
- bubble + modal + listener overlay как базовую interaction model;
- server-side recording эфиров.

## 10. Что рекомендовано переделать в первую очередь

### Приоритет A — архитектурно

1. Свести Studio к одному основному продукту: встроенный reader-first режим.
2. Разделить:
   - core API;
   - live presence;
   - stream ingest.
3. Убрать критически важные in-memory state участки из роли источника истины.
4. Спроектировать контур масштабирования для streaming ingestion.

### Приоритет B — продуктово

1. Довести workflow состояний:
   - prep
   - live
   - paused
   - ending confirm
   - summary
2. Сделать Studio профессиональным reading workbench.
3. Довести listener UX:
   - выбор чтеца;
   - стабильное прослушивание;
   - понятный post-listening переход к позиции.

### Приоритет C — reliability

1. Отдельно проверить reconnect story.
2. Отдельно проверить live-stop/live-crash cleanup.
3. Добавить наблюдаемость:
   - ingest errors
   - ffmpeg failures
   - session churn
   - heartbeat misses
   - recording write failures

## 11. Предлагаемый следующий шаг после аудита

Следующим шагом логично сделать уже не общий обзор, а **Gap Analysis + Roadmap**:

1. концепт vs текущая реализация по экранам и сценариям;
2. список задач по блокам:
   - UI/UX
   - reliability
   - scale
   - data/contracts
3. выделить:
   - что идет в Phase 1;
   - что идет в Phase 2;
   - что нельзя делать без отдельной архитектурной подготовки.
