# VoxLibris Studio — документация

Дата: 2026-04-28

Этот каталог содержит актуальный набор документов по VoxLibris Studio.

Сейчас он разделён на два слоя:

1. исторический и архитектурный контекст;
2. текущий pragmatic baseline на Icecast.

## Исторический и архитектурный контекст

- [Аудит текущей реализации](./vlstudio-audit-2026-04-24.md)
- [Большой roadmap / gap analysis](./vlstudio-roadmap-2026-04-24.md)
- [Контрольная точка baseline на 2026-04-24](./vlstudio-checkpoint-2026-04-24-baseline.md)

## Текущий рабочий пакет по Icecast baseline

- [Roadmap стабилизации Icecast baseline](./VLSTUDIO_ICECAST_ROADMAP_2026-04-28.md)
- [Baseline текущего стабильного контура](./VLSTUDIO_ICECAST_BASELINE_2026-04-28.md)
- [Почему сейчас выбран Icecast и как готовить возврат к WebRTC](./VLSTUDIO_ICECAST_DECISION_AND_WEBRTC_RETURN_2026-04-28.md)

## WebRTC-ветки как reference

Старые ветки с WebRTC/mediasoup реализацией Studio:

- **`dev_08.02.26`** — основная ветка с mediasoup backend. Ключевые файлы:
  - `server/webrtc/index.ts`
  - `server/webrtc/mediasoup-config.ts`
  - `server/webrtc/mediasoup-manager.ts`
  - `server/webrtc/room-manager.ts`
  - `server/webrtc/types.ts`
  - `server/webrtc/webrtc-handler.ts`
  - `server/routes/webrtc.ts`
  - `server/services/reading-session-webrtc.ts`

- **`dev_12.02.26`** — может содержать дополнительные правки той же WebRTC-ветки.

Эти ветки можно использовать как **reference и источник идей**, но код напрямую не адаптирован под текущий baseline. При возврате к WebRTC потребуется пересмотр с учётом текущего deploy-контура.

## План миграции на WebRTC

- [Миграция useAudioStream: Icecast → WebRTC/mediasoup](./MIGRATION_USE_AUDIO_STREAM_TO_WEBRTC.md) — детальный план замены transport layer с анализом старой реализации из `dev_08.02.26`

## Как этим пользоваться

- если нужен широкий продуктовый и архитектурный контекст, начинать с аудита и roadmap 2026-04-24;
- если нужен текущий execution baseline, ориентироваться на документы по Icecast от 2026-04-28;
- новые решения по Studio дальше фиксировать уже в этом каталоге, не создавая новые top-level `docs/vlstudio-*.md`;
- WebRTC-идеи и паттерны смотреть в ветках `dev_08.02.26` / `dev_12.02.26`.
