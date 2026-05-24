# VoxLibris Studio — Gap Analysis и Roadmap

Дата: 2026-04-24

> Статус: исторический и архитектурный документ.
> 
> Для текущего рабочего baseline и ближайшего execution-плана см. документы в этом же каталоге:
> - [Icecast roadmap](./VLSTUDIO_ICECAST_ROADMAP_2026-04-28.md)
> - [Icecast baseline](./VLSTUDIO_ICECAST_BASELINE_2026-04-28.md)
> - [Почему сейчас выбран Icecast](./VLSTUDIO_ICECAST_DECISION_AND_WEBRTC_RETURN_2026-04-28.md)

Связанный документ: [Аудит текущей реализации](./vlstudio-audit-2026-04-24.md)

## 1. Ключевые решения перед началом работ

### 1.1. Обычный клуб vs клуб чтеца

Нужны **два режима одного продукта**, а не две независимые реализации.

#### Обычный клуб

Основной сценарий:

- пользователь читает в клубном ридере;
- чтец нажимает bubble "Начать читать";
- Studio открывается как reader-first overlay / embedded mode;
- слушатели подключаются через live bubble и слушают поверх ридера.

#### Клуб чтеца

Основной сценарий:

- Studio — главный рабочий интерфейс чтеца;
- открывается как отдельная dedicated страница / route;
- слушатели видят не полный reader, а компактный listening UI / mini-player / listener page.

### 1.2. Архитектурный вывод

Правильная модель:

- **один Studio Core**;
- **два shell-режима**:
  1. embedded studio shell для обычного клуба;
  2. dedicated studio shell для клуба чтеца.

Неправильная модель:

- поддерживать две независимые Studio-реализации с разной логикой и разными компонентами.

### 1.3. Что это значит practically

Надо проектировать по-новой **не с нуля весь функционал**, а **новую правильную Studio-архитектуру**:

- общий state machine;
- общий аудио-контур;
- общий reading surface;
- общий live/session слой;
- общие control components;
- разные layout shells для разных продуктов.

## 2. Ответ на вопрос про отдельную страницу для клуба чтеца

### Короткий ответ

Да, для **клуба чтеца** отдельная страница нужна.

Но ее лучше делать **не как продолжение текущей `reader-studio.tsx`**, а как **новый dedicated shell поверх общего Studio Core**.

### Почему не стоит просто развивать текущую отдельную страницу как есть

Потому что текущая страница уже несет признаки старого MVP:

- в ней смешаны state, data fetching, audio, upload, overlay logic;
- она не является реальным single source of truth;
- более зрелый продуктовый сценарий уже частично живет внутри `ClubReader`;
- если просто продолжать ее дорабатывать, получится еще одна параллельная ветка логики.

### Что лучше сделать

Новая модель:

- `StudioCoreProvider` / `useStudioSessionController`
- `StudioReadingSurface`
- `StudioControls`
- `StudioLivePanel`
- `StudioPrepPanel`
- `StudioSummary`

и поверх этого:

- `EmbeddedClubStudioShell`
- `DedicatedReaderClubStudioPage`

То есть:

- для обычного клуба Studio встраивается в reader;
- для клуба чтеца Studio — основной full-page интерфейс;
- логика при этом не дублируется.

## 3. Ответ на вопрос про 2000+ одновременных эфиров

### Короткий ответ

Решение — **вынести ingest-путь из основного app backend** и убрать модель "один ffmpeg-процесс внутри общего сервера на каждый эфир" из критического production-контура.

### Почему текущая схема плоха на таком масштабе

Сейчас на каждый эфир приходится:

- browser -> long-running POST;
- отдельный `ffmpeg` процесс;
- запись на локальный диск;
- proxy через общий backend.

Для 2000+ одновременных эфиров это создает риски по:

- CPU;
- RAM;
- file descriptors;
- process churn;
- network saturation;
- blast radius: стриминг начинает мешать обычному API.

### Рекомендуемое направление

#### Вариант A — pragmatic production path

Разделить систему на слои:

1. **Main App API**
   - auth
   - club logic
   - reader logic
   - studio session state

2. **Live Presence / Realtime layer**
   - Redis
   - WebSocket / pubsub
   - session presence
   - reader position sync

3. **Streaming Ingest Gateway**
   - отдельный сервис
   - принимает аудио от чтеца
   - кодирует/маршрутизирует поток
   - пишет в Icecast или другой distribution layer

4. **Streaming Delivery layer**
   - Icecast / edge tier
   - listener delivery

5. **Recording / post-processing layer**
   - отдельная запись эфиров
   - object storage вместо local disk в production

#### Вариант B — еще более правильный long-term путь

Уйти от browser `MediaRecorder -> fetch streaming` к более контролируемому ingest-протоколу/контурy.

Но это уже Phase 3+, не то, что надо делать первым шагом.

### Что делать practically сейчас

#### Phase 1

- оставить текущую ingest-схему для MVP/beta;
- но сразу отделить ответственность в коде;
- убрать in-memory critical state;
- добавить telemetry/metrics/recovery.

#### Phase 2

- вынести `studio-stream` в отдельный сервис;
- вынести server-side recording из local FS в object storage pipeline;
- подготовить horizontal scaling ingest nodes.

#### Phase 3

- оценить альтернативный ingest stack под большие нагрузки.

## 4. Целевая архитектура Studio

## 4.1. Product architecture

### Studio Core

Общий модуль, содержащий:

- session lifecycle;
- audio lifecycle;
- microphone check;
- live state;
- bookmarks/marks;
- reader position sync;
- summary state;
- analytics hooks.

### Studio Shells

#### Embedded shell

Для обычного клуба:

- интегрируется в `ClubReader`;
- оставляет reader главным UI;
- controls не ломают reading flow.

#### Dedicated shell

Для клуба чтеца:

- full-page Studio;
- текст и эфир как главный интерфейс;
- отдельный listener entrypoint.

## 4.2. Technical architecture

### Session layer

Источник истины:

- DB + Redis;
- не in-memory React state;
- не process-local maps как критический source of truth.

### Live presence layer

- Redis session presence;
- pub/sub;
- heartbeat;
- cleanup workers;
- reconnect semantics.

### Streaming layer

- ingest gateway;
- audio transcoding/normalization;
- distribution to Icecast;
- recording pipeline.

## 5. Gap analysis

## 5.1. Product gaps

### G1. Нет единой Studio-модели

Сейчас:

- embedded studio живет в `ClubReader`;
- standalone Studio живет отдельно;
- логика дублируется.

Нужно:

- единый Studio Core;
- единый набор состояний;
- единые компоненты control surface.

### G2. Не завершен lifecycle эфира

Сейчас:

- есть `prep`, `live`, `paused`;
- нет `ending`, `summary` как полноценного UX.

Нужно:

- confirm end dialog;
- итоговая summary screen/panel;
- next actions.

### G3. Не завершен reader-first workbench UX

Нужно:

- более сильная композиция reading surface;
- marks/bookmarks while live;
- quick chapter switching;
- professional text settings panel;
- network/audio health indicators без перегруза.

### G4. Не завершен listener UX

Нужно:

- более зрелый active readers modal;
- better mini-player for reader-club listeners;
- гарантированный сценарий перехода к позиции чтеца;
- ясный stop/end/reconnect UX.

### G5. Не завершен chat/reactions/questions UX

Нужно:

- мягкие реакции;
- вопросы в pause/live контексте;
- компактный question tray;
- moderation rules для reader-club режима.

## 5.2. Reliability gaps

### R1. Critical in-memory state

Проблемные места:

- process-local `activeStreams`;
- local memory analytics tracking;
- расслоение session state по разным контурам.

Нужно:

- перенести критический coordination state в Redis/DB/event layer.

### R2. Reconnect story не доведена до строгой модели

Нужно определить и реализовать:

- reader reconnect;
- socket reconnect;
- ingest reconnect;
- listener reconnect;
- cleanup timeout policy.

### R3. Нет production-grade observability

Нужно добавить:

- ingest success/failure metrics;
- ffmpeg/process failures;
- stream startup latency;
- mount acceptance errors;
- recording write failures;
- session orphan cleanup metrics.

## 5.3. Scale gaps

### S1. Ingest внутри main app

Нужно:

- вынести streaming ingest в отдельный сервис.

### S2. Local recordings

Нужно:

- перейти с local FS к object storage strategy для production.

### S3. Нет explicit capacity architecture

Нужно:

- спроектировать scale targets;
- определить limits per node;
- рассчитать ingest node capacity;
- определить listener delivery topology.

## 6. Roadmap по фазам

Статус обозначений:

- [x] выполнено
- [ ] в работе / предстоит

## Phase 1 — Unified Studio Foundation

Цель: перестать плодить две Studio и собрать единое ядро.

### Выполнено

- [x] Зафиксирована модель: один Studio Core, два shell-режима.
- [x] Добавлен dedicated shell: `DedicatedStudioShell`.
- [x] Добавлен embedded shell: `EmbeddedClubStudioShell`.
- [x] Добавлены shared session dialogs/overlays.
- [x] Lifecycle `prep/live/paused/summary` частично унифицирован через `useStudioMode`.
- [x] Добавлены confirm-end и summary UX-состояния.
- [x] Mic-check flow централизован в `useStudioMode`.
- [x] Reader Studio и embedded studio переведены на общие presentation helper'ы.
- [x] Начата очистка `useAudioStream` и client-side streaming orchestration.

### Осталось по Phase 1

- [ ] Зафиксировать целевой публичный контракт `StudioCore` / `Studio session controller` как отдельный documented API.
- [ ] Довести state model до явной формы `prep -> live -> paused -> ending -> summary` без неявных переходов по флагам.
- [ ] Проверить, не осталось ли дублирования orchestration между `reader-studio.tsx`, `ClubReader.tsx`, `useStudioMode`, `useAudioStream`.
- [ ] Решить, нужен ли отдельный `StudioCoreProvider`, или текущий набор shared hooks/helpers уже достаточен на этом этапе.

### Результат

- один source of truth для Studio state;
- embedded и dedicated режимы используют одни и те же core-слои.

## Phase 2 — Professional Reader UX

Цель: довести Studio до уровня реального рабочего места чтеца.

### Выполнено

- [x] Улучшена visual hierarchy Studio shells.
- [x] Добавлены и подключены shared brand elements (`StudioWordmark`).
- [x] Улучшены right-side studio entry элементы в клубном ридере.
- [x] Добавлены shared prep/view resolvers.
- [x] Вынесены stage overlays в shared component.
- [x] EndingConfirm и Summary уже существуют и работают в dedicated + embedded shell.
- [x] Убрана одна из вероятных причин scroll-jump в reader surface: отключено `content-visibility: auto` на верхнеуровневых reader-блоках.
- [x] Клубный ридер приведён к той же theme-композиции, что и персональный reader, для dark/sepia: выровнены глобальные reader theme overrides и surface ratios.

### Осталось по Phase 2

- [x] Доделать полноценный `PrepPanel` / compact prep bar как единый shared component для dedicated и embedded режима.
- [ ] Довести `LivePanel` / control surface до окончательной продуктовой композиции.
- [x] Привести prep/start actions к единому visual language без локальных ad-hoc решений.
- [ ] Проверить, не мешают ли floating / rail элементы чтению во всех сценариях desktop usage.
- [ ] Провести ручную UX-проверку `prep -> start -> pause -> resume -> end -> summary`.
- [ ] Перепроектировать отображение очень больших книг без глав: текущая модель single long scroll технически работает, но не выглядит надёжной и удобной как финальный production UX.

### Результат

- Studio выглядит и работает как профессиональный инструмент.

## Phase 3 — Listener Experience

Цель: довести UX слушателя до зрелого состояния.

### Выполнено

- [x] Улучшены live entry surfaces в клубном ридере.
- [x] Улучшен active readers modal.
- [x] Есть сценарий `stream ended -> offer sync to reader position`.
- [x] Подавлен ложный prompt о более новой позиции без локальной читательской активности.

### Осталось по Phase 3

- [ ] Довести listener mini-player / overlay до production-polished состояния.
- [ ] Проверить reconnect/stop/end UX глазами слушателя.
- [ ] Довести активный listening flow до единой product-концепции.
- [ ] Подготовить listener shell / listener page для dedicated reader-club режима.

### Результат

- слушательский сценарий становится понятным и надежным.

## Phase 4 — Reliability Hardening

Цель: сделать эфир устойчивым.

### Выполнено

- [x] Начата server-side декомпозиция streaming/recording helpers.
- [x] Вынесены части client-side streaming orchestration из `useAudioStream`.
- [x] Исправлен live playback path backend -> Icecast: backend теперь публикует live MP3 в Icecast через отдельный `ffmpeg` publisher вместо ручного HTTP PUT.
- [x] Подтверждён рабочий multi-reader live сценарий минимум для 5 одновременных чтецов через `script/studio-sim.ts`.
- [x] Стабилизирована финализация session analytics после потери process-local state: `PUT /api/sessions/:id/end` больше не падает только из-за пустого in-memory `activeSessions`.
- [x] Убран лишний error/warn шум при штатном завершении ingest-потока (`ECONNRESET` / ffmpeg `255` во время controlled shutdown больше не должны логироваться как авария).
- [x] Подключён listener analytics tracking в реальные join/leave flows; `peakListenerCount` подтверждён на живом сценарии чтец -> слушатель -> завершение эфира.
- [x] Подтверждён живой reader-listener сценарий на реальном потоке после server-side fixes.

### Осталось по Phase 4

- [ ] Убрать критичную зависимость от process-local state на сервере.
- [ ] Перенести active stream coordination в Redis / shared coordination layer.
- [ ] Добавить reconnect semantics для reader/listener/ingest.
- [ ] Добавить observability и метрики Studio/streaming.
- [ ] Добавить orphan cleanup и session reconciliation.
- [ ] Проверить и стабилизировать stop/start race conditions уже после cleanup-шумоподавления на shutdown path.

### Результат

- существенно более предсказуемое поведение эфира.

## Phase 5 — Scale Architecture

Цель: подготовить путь к 2000+ одновременным эфирам.

### Выполнено

- [x] Подтверждён production-safe порядок миграций `0037`–`0040`; миграции применены на проде без ошибок.

### Осталось по Phase 5

- [ ] Вынести `studio-stream` в отдельный ingest service.
- [ ] Спроектировать horizontal scaling ingest nodes.
- [ ] Перевести recording pipeline на object storage.
- [ ] Зафиксировать capacity model и SLO.
- [ ] Провести нагрузочное тестирование ingest/delivery отдельно от app API.

### Результат

- появляется реалистичный путь к большому масштабу.

## 7. Приоритет реализации

### Что делать немедленно

1. Unified Studio Foundation
2. Professional Reader UX
3. Listener Experience

### Что нельзя откладывать слишком долго

4. Reliability Hardening

### Что делать после стабилизации продукта

5. Scale Architecture

## 8. Практический следующий фронт работ

### Ближайший приоритет

- [x] Добить shared presentation вокруг prep-состояния: compact prep bar / prep actions / единый prep surface.
- [x] Довести dedicated и embedded prep UI до одной модели поведения и одинаковых состояний.
- [ ] Провести ручную Studio/Reader UX-проверку после последней стабилизации reader/studio flows и theme fixes.
- [ ] Отдельно спроектировать UX/техническую модель для очень больших книг без глав, чтобы уйти от зависимости на один бесконечный scroll-контейнер.

### После этого

- [ ] Провести ручную проверку сценариев после последнего server-side cleanup-pass:
  - [x] start broadcast
  - [ ] pause / resume
  - [x] end / summary
  - [x] listener connect / disconnect
  - [x] stream ended -> sync to reader position
  - [ ] microphone warning / retry / recheck
- [x] Подтвердить live playback на реальном контуре (сайт + VLC).
- [x] Подтвердить multi-reader live playback на нескольких одновременных сессиях через симулятор.
- [ ] Зафиксировать отдельно remaining runtime UX / state issues, если они проявятся уже после ручной проверки.
- [ ] После ручной проверки перейти к следующему reliability-срезу server-side Studio.
