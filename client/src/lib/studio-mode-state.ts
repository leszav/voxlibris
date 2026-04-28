type StudioVisualState = 'prep' | 'live' | 'paused';

interface ResolveStudioModeStateParams {
  sessionIsLive: boolean;
  sessionIsPaused: boolean;
  sessionListenerCount: number;
  fallbackListenerCount: number;
}

export interface ResolvedStudioModeState {
  state: StudioVisualState;
  listenerCount: number;
}

export function resolveStudioModeState({
  sessionIsLive,
  sessionIsPaused,
  sessionListenerCount,
  fallbackListenerCount,
}: ResolveStudioModeStateParams): ResolvedStudioModeState {
  let state: StudioVisualState;

  if (!sessionIsLive) {
    state = 'prep';
  } else if (sessionIsPaused) {
    state = 'paused';
  } else {
    state = 'live';
  }

  return {
    state,
    listenerCount: sessionListenerCount || fallbackListenerCount,
  };
}
