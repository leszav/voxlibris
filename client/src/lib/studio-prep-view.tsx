interface ResolveStudioPrepViewParams {
  microphoneAvailable: boolean;
  microphoneError: string | null;
  micCheckPassed: boolean;
  isStartingBroadcast: boolean;
  sessionConnected: boolean;
  sessionId?: string | null;
}

export interface StudioPrepViewState {
  startButtonLabel: string;
  compactStartButtonLabel: string;
  startDisabled: boolean;
  prepStatusText: string;
}

interface ResolveDedicatedStudioPrepModalOpenParams {
  dismissed: boolean;
  state: "prep" | "live" | "paused";
  showMicCheck: boolean;
  microphoneAvailable: boolean;
  microphoneLoading: boolean;
}

interface ResolveEmbeddedStudioPrepBarOpenParams {
  isOpen: boolean;
  state: "prep" | "live" | "paused";
}

interface ResolveStudioMicCheckModalOpenParams {
  state: "prep" | "live" | "paused";
  showMicCheck: boolean;
  micCheckPassed?: boolean;
  microphoneAvailable: boolean;
  microphoneLoading: boolean;
  requireMicCheckPending?: boolean;
}

interface ResolveStudioRuntimeMicCheckActionVisibleParams {
  state: "prep" | "live" | "paused";
  microphoneAvailable: boolean;
}

export function resolveStudioPrepView({
  microphoneAvailable,
  microphoneError,
  micCheckPassed,
  isStartingBroadcast,
  sessionConnected,
  sessionId,
}: ResolveStudioPrepViewParams): StudioPrepViewState {
  const startButtonLabel = (() => {
    if (!micCheckPassed) return 'Требуется проверка микрофона';
    if (isStartingBroadcast) return 'Запуск эфира...';
    if (sessionConnected) return 'Начать прямой эфир';
    return 'Начать прямой эфир (соединение восстанавливается)';
  })();

  const prepStatusText = (() => {
    if (!microphoneAvailable) {
      return microphoneError ?? 'Микрофон отсутствует/выключен. Подключите или включите микрофон.';
    }

    if (micCheckPassed) {
      return sessionConnected
        ? 'Микрофон проверен. Готов к эфиру.'
        : 'Микрофон проверен. Соединение сессии восстанавливается.';
    }

    return sessionConnected
      ? 'Проверьте микрофон перед запуском эфира.'
      : 'Проверьте микрофон. Соединение сессии восстанавливается.';
  })();

  return {
    startButtonLabel,
    compactStartButtonLabel: isStartingBroadcast ? 'Запуск...' : 'В эфир',
    startDisabled: !sessionId || !microphoneAvailable || !micCheckPassed || isStartingBroadcast,
    prepStatusText,
  };
}

export function resolveDedicatedStudioPrepModalOpen({
  dismissed,
  state,
  showMicCheck,
  microphoneAvailable,
  microphoneLoading,
}: ResolveDedicatedStudioPrepModalOpenParams): boolean {
  if (dismissed || state !== "prep") {
    return false;
  }

  // Пока активна отдельная проверка микрофона, prep modal скрываем,
  // чтобы не наслаивать два конкурирующих prep-слоя.
  if (showMicCheck && microphoneAvailable && !microphoneLoading) {
    return false;
  }

  return true;
}

export function resolveEmbeddedStudioPrepBarOpen({
  isOpen,
  state,
}: ResolveEmbeddedStudioPrepBarOpenParams): boolean {
  return isOpen && state === "prep";
}

export function resolveStudioMicCheckModalOpen({
  state,
  showMicCheck,
  micCheckPassed,
  microphoneAvailable,
  microphoneLoading,
  requireMicCheckPending = false,
}: ResolveStudioMicCheckModalOpenParams): boolean {
  if (state !== "prep" || !showMicCheck || !microphoneAvailable || microphoneLoading) {
    return false;
  }

  if (requireMicCheckPending) {
    return micCheckPassed !== true;
  }

  return true;
}

export function resolveStudioRuntimeMicCheckActionVisible({
  state,
  microphoneAvailable,
}: ResolveStudioRuntimeMicCheckActionVisibleParams): boolean {
  return state === "prep" && microphoneAvailable;
}
