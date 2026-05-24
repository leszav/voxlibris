# Архитектура ридеров VoxLibris

## Цель
Этот документ фиксирует, что персональный и клубный ридеры работают на общем ядре, а различия вынесены в адаптеры данных.

## Ключевая идея
- Общее: логика сериализации позиции, вычисления прогресса, дебаунс-сохранения, восстановления скролла, состояние синхронизации, UI-индикация.
- Кастомное: источники данных и API (персональный/клубный) через адаптеры.

## Структура общего ядра

### 1) Core прогресса
Файл: `client/src/components/reader/core/reader-progress-core.ts`
- `serializeReaderPosition` / `parseReaderPosition`
- `calculateReadingProgress`
- `createReaderProgressPayload`
- Единый формат `currentPosition` (JSON-строка с `chapter`, `scrollTop`, `scrollHeight`, `clientHeight`, `timestamp`)

### 2) Core синхронизации скролла
Файл: `client/src/components/reader/core/use-reader-progress-sync.ts`
- `useDebouncedReaderProgressSave`:
  - `scheduleSave()` для скролла
  - `saveNow()` для форс-сохранения (смена главы, "прочитано")
- `useRestoreReaderScroll`:
  - восстанавливает `scrollTop` из сохраненной позиции
  - содержит повторные попытки восстановления при поздней стабилизации верстки

### 3) Core статуса синка
Файл: `client/src/components/reader/core/use-reader-sync-state.ts`
- `useReaderSyncState`:
  - `saveWithSync(payload)` оборачивает сохранение в состояние `isSyncing/syncError/lastSyncTime`
  - единое поведение для отображения статуса синхронизации в любых ридерах

### 4) Core адаптеров данных
Файл: `client/src/components/reader/core/use-reader-data-adapters.ts`
- `usePersonalReaderAdapter(...)`
- `useClubReaderAdapter(...)`
- Задача адаптеров: привести разные API к одному контракту для UI.

## Унифицированная индикация
Файл: `client/src/components/reader/ReaderProgressIndicators.tsx`
- Общий индикатор синхронизации (`CompactSyncIndicator`)
- Общая плавающая панель прогресса (автоскрытие, hover, процент/глава)
- Поддержка:
  - только пользовательского прогресса (персональный ридер)
  - пользовательского + группового прогресса (клубный ридер)

## Подключение в ридерах

### Персональный ридер
Файл: `client/src/components/reader/ReaderWorkspace.tsx`
- Использует:
  - `usePersonalReaderAdapter`
  - `useReaderSyncState`
  - `useDebouncedReaderProgressSave`
  - `useRestoreReaderScroll`
  - `ReaderProgressIndicators`

### Клубный ридер
Файл: `client/src/components/reader/ClubReader.tsx`
- Использует:
  - `useClubReaderAdapter`
  - `useReaderSyncState`
  - `useDebouncedReaderProgressSave`
  - `useRestoreReaderScroll`
  - `ReaderProgressIndicators` (с `groupProgress`)

## Поток данных (коротко)
1. Ридер получает `progress` и контент через адаптер.
2. На скролле вызывается `scheduleSave()`.
3. Формируется payload через `createReaderProgressPayload`.
4. `saveWithSync()` отправляет в API и обновляет состояние синка.
5. При повторном входе `useRestoreReaderScroll` восстанавливает позицию.

## Как расширять для VoxLibris Studio Reader
1. Создать адаптер `useStudioReaderAdapter` с тем же контрактом:
   - `progress/progressLoading/contentLoading/bookData/currentChapterContent/saveProgress`
2. Использовать существующие core-хуки и `ReaderProgressIndicators`.
3. Не дублировать логику `scroll/progress/sync` в новом UI-компоненте.

## Правила, которые важно сохранять
- Не менять формат `currentPosition` без миграции.
- Не обходить core-хуки локальными реализациями debounce/restore.
- При добавлении нового типа ридера сначала делать адаптер, затем UI.
- keepalive-сохранение на unmount должно использовать тот же payload-формат.
