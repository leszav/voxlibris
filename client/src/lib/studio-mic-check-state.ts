export interface ResolvedStudioMicCheckState {
  micCheckPassed: boolean;
  showMicCheck: boolean;
  shouldClearCache: boolean;
}

interface ResolveStudioMicCheckStateParams {
  microphoneAvailable: boolean;
  hasRecentMicCheck: boolean;
}

interface ResolveStudioStartGuardParams {
  userId?: string;
  sessionId: string | null;
  availableNow: boolean;
  microphoneError: string | null;
  micCheckPassed: boolean;
}

export interface StudioStartGuardResult {
  canStart: boolean;
  errorMessage: string | null;
  shouldShowMicCheck: boolean;
  shouldResetMicCheck: boolean;
}

export function resolveStudioMicCheckState({
  microphoneAvailable,
  hasRecentMicCheck,
}: ResolveStudioMicCheckStateParams): ResolvedStudioMicCheckState {
  if (!microphoneAvailable) {
    return {
      micCheckPassed: false,
      showMicCheck: true,
      shouldClearCache: true,
    };
  }

  if (hasRecentMicCheck) {
    return {
      micCheckPassed: true,
      showMicCheck: false,
      shouldClearCache: false,
    };
  }

  return {
    micCheckPassed: false,
    showMicCheck: true,
    shouldClearCache: false,
  };
}

export function resolveStudioStartGuard({
  userId,
  sessionId,
  availableNow,
  microphoneError,
  micCheckPassed,
}: ResolveStudioStartGuardParams): StudioStartGuardResult {
  if (!userId) {
    return {
      canStart: false,
      errorMessage: 'Пользователь не авторизован',
      shouldShowMicCheck: false,
      shouldResetMicCheck: false,
    };
  }

  if (!sessionId) {
    return {
      canStart: false,
      errorMessage: 'Сессия ещё не создана. Подождите.',
      shouldShowMicCheck: false,
      shouldResetMicCheck: false,
    };
  }

  if (!availableNow) {
    return {
      canStart: false,
      errorMessage: microphoneError ?? 'Микрофон недоступен. Подключите или включите микрофон.',
      shouldShowMicCheck: true,
      shouldResetMicCheck: true,
    };
  }

  if (!micCheckPassed) {
    return {
      canStart: false,
      errorMessage: 'Сначала пройдите проверку микрофона',
      shouldShowMicCheck: true,
      shouldResetMicCheck: false,
    };
  }

  return {
    canStart: true,
    errorMessage: null,
    shouldShowMicCheck: false,
    shouldResetMicCheck: false,
  };
}
