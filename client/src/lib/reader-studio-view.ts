import type { NetworkQuality } from "@/lib/studio-types";

interface ResolveReaderStudioViewParams {
  state: 'prep' | 'live' | 'paused';
  micCheckPassed: boolean;
  isStartingBroadcast: boolean;
  isSessionConnected: boolean;
  microphoneIssue: string | null;
  microphoneLoading: boolean;
  microphoneAvailable: boolean;
  microphoneError: string | null;
  clubBookTitle?: string | null;
  chapterTitle?: string | null;
  currentChapter: number;
}

export interface ReaderStudioViewState {
  runtimeMicrophoneWarning: string | null;
  startBroadcastButtonLabel: string;
  networkQuality: NetworkQuality;
  bookTitle: string;
  chapterTitle: string;
}

export function resolveReaderStudioViewState({
  state,
  micCheckPassed,
  isStartingBroadcast,
  isSessionConnected,
  microphoneIssue,
  microphoneLoading,
  microphoneAvailable,
  microphoneError,
  clubBookTitle,
  chapterTitle,
  currentChapter,
}: ResolveReaderStudioViewParams): ReaderStudioViewState {
  const runtimeMicrophoneWarning = microphoneIssue
    ?? ((state !== 'prep' && !microphoneLoading && !microphoneAvailable)
      ? (microphoneError ?? 'Микрофон недоступен во время эфира')
      : null);

  const startBroadcastButtonLabel = (() => {
    if (!micCheckPassed) return 'Требуется проверка микрофона';
    if (isStartingBroadcast) return 'Запуск эфира...';
    if (isSessionConnected) return 'Начать прямой эфир';
    return 'Начать прямой эфир (соединение восстанавливается)';
  })();

  return {
    runtimeMicrophoneWarning,
    startBroadcastButtonLabel,
    networkQuality: isSessionConnected ? 'good' : 'poor',
    bookTitle: clubBookTitle ?? 'Книга',
    chapterTitle: chapterTitle ?? `Глава ${currentChapter}`,
  };
}
