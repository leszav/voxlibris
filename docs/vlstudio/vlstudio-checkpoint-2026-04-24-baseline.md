# VoxLibris Studio — контрольная точка перед внешней доработкой

Дата фиксации: 2026-04-24

> Статус: историческая контрольная точка.
> 
> Этот документ полезен как reference по состоянию на 2026-04-24, но текущий рабочий baseline по live-контуру теперь зафиксирован отдельно:
> - [Icecast baseline](./VLSTUDIO_ICECAST_BASELINE_2026-04-28.md)
> - [Icecast roadmap](./VLSTUDIO_ICECAST_ROADMAP_2026-04-28.md)

Назначение документа: зафиксировать текущее состояние VoxLibris Studio перед следующим циклом работ стороннего разработчика, чтобы затем провести комплексный аудит относительно этого baseline.

Связанные документы:

- [Аудит текущей реализации](./vlstudio-audit-2026-04-24.md)
- [Актуальный roadmap](./vlstudio-roadmap-2026-04-24.md)

## 1. Текущее состояние

Проект находится на этапе:

- после существенной расчистки client-side streaming orchestration;
- после выделения dedicated и embedded studio shell;
- после начала системной сборки shared presentation layer;
- до этапа ручных E2E-проверок Studio/Reader сценариев;
- до server-side reliability hardening и scale-oriented реархитектуры.

## 2. Что уже реализовано и считается baseline

### 2.0. Дополнительная фиксация статуса после live stabilization pass

- backend -> Icecast publish path стабилизирован через отдельный `ffmpeg` publisher внутри `server/routes/studio-stream.ts`;
- подтверждён реальный reader-listener сценарий в живом контуре;
- listener analytics подключены к реальным join/leave flows, `peakListenerCount` обновляется на реальном сценарии;
- финализация session analytics больше не зависит жёстко от наличия process-local active session state;
- снижён шум штатного shutdown ingest-пайплайна (`ECONNRESET`, ffmpeg `255` при controlled shutdown);
- из reader theme layer убран `content-visibility: auto` на верхнеуровневых reader-блоках как вероятный источник scroll-jump;
- club reader theme composition для dark/sepia приведена к той же модели surface ratios, что и personal reader;
- отдельно выявлен следующий продуктовый фронт: большие книги без глав требуют отдельного UX/technical redesign, а не только точечных CSS/scroll-фиксов.

### 2.1. Studio shells / dialogs / overlays

- `client/src/components/studio/DedicatedStudioShell.tsx`
- `client/src/components/studio/EmbeddedClubStudioShell.tsx`
- `client/src/components/studio/StudioSessionDialogs.tsx`
- `client/src/components/studio/StudioSessionOverlays.tsx`
- `client/src/components/studio/StudioStageOverlays.tsx`
- `client/src/components/studio/StudioRuntimeMicrophoneWarning.tsx`

Состояние:

- dedicated и embedded режимы используют shared session overlays;
- runtime microphone warning вынесен в shared component;
- stage overlays вынесены из `reader-studio.tsx` в shared component.

### 2.2. Studio branding / UI identity

- `client/src/components/studio/StudioWordmark.tsx`
- `client/src/components/studio/LiveTopBar.tsx`
- `client/src/components/studio/ControlBar.tsx`

Состояние:

- branding приведён к модели `VoxLibris Studio` как отдельного модуля;
- wordmark используется в верхней панели и control bar.

### 2.3. Reader / embedded studio UX

- `client/src/components/studio/ReadNowBubble.tsx`
- `client/src/components/studio/LiveReadersBubble.tsx`
- `client/src/components/reader/ClubReader.tsx`
- `client/src/components/reader/core/use-reader-latest-progress.ts`

Состояние:

- studio entry элементы в клубном ридере приведены к более профессиональной подаче;
- floating entry скрывается за правой границей экрана в неактивном состоянии;
- сценарий `stream ended -> offer sync to reader position` сохранён;
- ложный prompt о более новой позиции подавлен, пока не было локальной читательской активности.

### 2.4. useStudioMode cleanup

Ключевые файлы:

- `client/src/hooks/use-studio-mode.ts`
- `client/src/lib/studio-mic-check-cache.ts`
- `client/src/lib/studio-mic-check-state.ts`
- `client/src/lib/studio-mode-state.ts`
- `client/src/lib/studio-session-summary.ts`
- `client/src/lib/reader-studio-view.ts`
- `client/src/lib/studio-prep-view.tsx`

Состояние:

- mic-check flow централизован;
- summary state и prep/start presentation logic частично вынесены в helper-слои;
- `useStudioMode` разгружен относительно исходной версии;
- dedicated и embedded prep presentation уже частично опираются на shared resolver'ы.

### 2.5. useAudioStream cleanup / streaming orchestration

Ключевые файлы:

- `client/src/hooks/use-audio-stream.ts`
- `client/src/lib/studio-streaming-gateway.ts`
- `client/src/lib/studio-streaming-errors.ts`
- `client/src/lib/studio-streaming-body.ts`
- `client/src/lib/studio-media-input.ts`
- `client/src/lib/studio-media-recorder.ts`
- `client/src/lib/studio-media-track.ts`
- `client/src/lib/studio-recording-blob.ts`

Состояние:

- ingest transport вынесен в gateway;
- transport/start/connect error mapping вынесен;
- streaming request body wiring вынесен;
- browser media input и mime capability вынесены;
- MediaRecorder wiring вынесен;
- microphone track ended binding вынесен;
- blob assembly для локальной записи вынесен;
- `useAudioStream` стал заметно более orchestration-oriented.

### 2.6. Server-side studio abstractions

Ключевые файлы:

- `server/lib/studio-recording-storage.ts`
- `server/lib/studio-streaming-state.ts`
- `server/lib/studio-streaming-service.ts`
- `server/routes/studio-stream.ts`

Состояние:

- server-side streaming/recording helpers уже частично выделены;
- критический active stream coordination по-прежнему не доведён до Redis-backed/shared source of truth.

### 2.7. Прод-операции, уже завершённые к данной точке

- миграции `0037`–`0040` проверены и успешно применены на проде;
- roadmap обновлён под текущее состояние.

## 3. Что ещё не считается завершённым

### Client / UI

- shared prep surface ещё не доведён до финального общего компонента;
- dedicated и embedded prep UI ещё не полностью унифицированы;
- listener mini-player / listener UX ещё не доведён до final polished state;
- manual UI/E2E verification ещё не выполнена.

### Reliability / backend

- process-local critical state ещё не устранён полностью;
- reconnect semantics ещё не доведены до production-grade модели;
- observability/metrics для Studio не завершены;
- scale architecture остаётся следующей фазой.

## 4. Что считать допустимым изменением после этой точки

Допустимо:

- продолжать small-step refactoring внутри shared presentation layer;
- продолжать small-step рефакторинг Studio client orchestration;
- улучшать dedicated/embedded prep/live UX без дублирования core logic;
- устранять type/lint/runtime дефекты, появившиеся в ходе этих изменений.

Нежелательно без явной причины:

- возвращать логику обратно из shared components/helpers в page-level code;
- плодить новые параллельные ветки Studio UI без shared contracts;
- вносить крупные server-side архитектурные изменения одновременно с UI-веткой;
- делать широкие несвязанные refactor'ы рядом с Studio.

## 5. Критерии для будущего аудита сторонней доработки

При следующем комплексном аудите проверять относительно этой контрольной точки:

- не появилась ли новая дублирующая Studio-логика;
- не ухудшились ли boundaries между orchestration / presentation / transport;
- не появились ли регрессии в embedded vs dedicated shell;
- не сломаны ли shared prep/runtime warning/session overlay контракты;
- не стал ли `useAudioStream` или `useStudioMode` снова избыточно монолитным;
- зелёный ли `pnpm run check`;
- есть ли новые lint/runtime warnings;
- не появилось ли product-level ухудшение в reader/studio UX.

## 6. Контрольная формулировка baseline

На этой контрольной точке VoxLibris Studio уже имеет:

- общий курс на unified architecture;
- working dedicated + embedded shell model;
- частично расчищенный Studio client core;
- shared presentation layer, который уже начал складываться системно;
- зелёный type-check baseline.

Любая следующая внешняя доработка должна улучшать эту структуру, а не размывать её.
