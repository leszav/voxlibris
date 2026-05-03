import { useCallback, useEffect, useState } from "react";
import { primeIcecastPlayback, stopIcecastPlayback } from "@/hooks/use-icecast-player";
import type { LiveReader } from "@/hooks/use-live-readers";
import { apiRequest } from "@/lib/queryClient";
import { getStudioStreamStatusUrl, type StudioStreamStatusResponse } from "@/lib/studio-streaming";

interface ClubListeningMeta {
  clubId: string;
  bookId?: string;
  bookTitle: string;
  bookAuthor?: string;
  coverUrl?: string | null;
}

interface ClubListeningState extends ClubListeningMeta {
  reader: LiveReader;
}

type StoreListener = (state: ClubListeningState | null) => void;

let currentListeningState: ClubListeningState | null = null;
const storeListeners = new Set<StoreListener>();

function emitState(): void {
  storeListeners.forEach((listener) => listener(currentListeningState));
}

function updateListeningState(nextState: ClubListeningState | null): void {
  currentListeningState = nextState;
  emitState();
}

function runBestEffort(task: Promise<unknown>): void {
  task.catch(() => undefined);
}

async function resolveReaderStreamUrl(reader: LiveReader): Promise<string> {
  if (reader.streamUrl) {
    return reader.streamUrl;
  }

  const status = await apiRequest<StudioStreamStatusResponse>(getStudioStreamStatusUrl(reader.sessionId));
  if (status.isLive && status.streamUrl) {
    return status.streamUrl;
  }

  throw new Error("Не удалось получить URL live-потока для прослушивания");
}

async function resolveReaderPlaybackState(reader: LiveReader): Promise<{
  streamUrl: string | null;
  isPaused: boolean;
}> {
  const status = await apiRequest<StudioStreamStatusResponse>(getStudioStreamStatusUrl(reader.sessionId));

  if (status.isLive && status.streamUrl) {
    return {
      streamUrl: status.streamUrl,
      isPaused: false,
    };
  }

  return {
    streamUrl: status.streamUrl ?? reader.streamUrl ?? null,
    isPaused: status.isPaused,
  };
}

async function waitForReaderPlaybackState(reader: LiveReader): Promise<{
  streamUrl: string | null;
  isPaused: boolean;
}> {
  if (reader.streamUrl) {
    let lastKnownUrl = reader.streamUrl;
    let isPaused = false;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const status = await apiRequest<StudioStreamStatusResponse>(getStudioStreamStatusUrl(reader.sessionId));
      if (status.isLive && status.streamUrl) {
        return {
          streamUrl: status.streamUrl,
          isPaused: false,
        };
      }
      isPaused = status.isPaused;
      lastKnownUrl = status.streamUrl ?? lastKnownUrl;
      await new Promise((resolve) => globalThis.setTimeout(resolve, 350));
    }

    return {
      streamUrl: lastKnownUrl,
      isPaused,
    };
  }

  return resolveReaderPlaybackState(reader);
}

async function joinReadingSession(sessionId: string): Promise<void> {
  await apiRequest(`/api/reading-sessions/${sessionId}/join`, {
    method: 'POST',
  });
}

async function leaveReadingSession(sessionId: string): Promise<void> {
  await apiRequest(`/api/reading-sessions/${sessionId}/leave`, {
    method: 'POST',
  });
}

export function useClubLiveListening(meta: ClubListeningMeta) {
  const [state, setState] = useState<ClubListeningState | null>(currentListeningState);

  useEffect(() => {
    const listener: StoreListener = (nextState) => {
      setState(nextState);
    };

    storeListeners.add(listener);
    listener(currentListeningState);

    return () => {
      storeListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!currentListeningState) return;
    if (currentListeningState.clubId === meta.clubId) return;

    stopIcecastPlayback();
    updateListeningState(null);
  }, [meta.clubId]);

  useEffect(() => {
    if (!currentListeningState) return;
    if (currentListeningState.clubId !== meta.clubId) return;

    const nextState: ClubListeningState = {
      ...currentListeningState,
      bookId: meta.bookId ?? currentListeningState.bookId,
      bookTitle: meta.bookTitle || currentListeningState.bookTitle,
      bookAuthor: meta.bookAuthor ?? currentListeningState.bookAuthor,
      coverUrl: meta.coverUrl ?? currentListeningState.coverUrl,
    };

    const changed = nextState.bookId !== currentListeningState.bookId
      || nextState.bookTitle !== currentListeningState.bookTitle
      || nextState.bookAuthor !== currentListeningState.bookAuthor
      || nextState.coverUrl !== currentListeningState.coverUrl;

    if (changed) {
      updateListeningState(nextState);
    }
  }, [meta.bookAuthor, meta.bookId, meta.bookTitle, meta.clubId, meta.coverUrl]);

  const listeningInCurrentClub = state?.clubId === meta.clubId ? state : null;

  useEffect(() => {
    if (!listeningInCurrentClub) return;

    let cancelled = false;

    const syncPlaybackState = async () => {
      try {
        const status = await apiRequest<StudioStreamStatusResponse>(
          getStudioStreamStatusUrl(listeningInCurrentClub.reader.sessionId),
        );
        if (cancelled || !currentListeningState) return;
        if (currentListeningState.reader.sessionId !== listeningInCurrentClub.reader.sessionId) return;

        const wasPaused = Boolean(currentListeningState.reader.isPaused);
        const nextIsPaused = status.isPaused || (!status.isLive && wasPaused);
        const nextReader: LiveReader = {
          ...currentListeningState.reader,
          streamUrl: status.streamUrl ?? currentListeningState.reader.streamUrl,
          isPaused: nextIsPaused,
        };

        const changed = nextReader.streamUrl !== currentListeningState.reader.streamUrl
          || nextReader.isPaused !== currentListeningState.reader.isPaused;

        if (nextIsPaused && !wasPaused) {
          stopIcecastPlayback();
        }

        if (status.isLive && wasPaused && nextReader.streamUrl) {
          runBestEffort(primeIcecastPlayback(nextReader.streamUrl));
        }

        if (changed) {
          updateListeningState({
            ...currentListeningState,
            reader: nextReader,
          });
        }
      } catch {
        // Оставляем текущее состояние слушателя до следующего poll.
      }
    };

    runBestEffort(syncPlaybackState());
    const timer = globalThis.setInterval(() => {
      runBestEffort(syncPlaybackState());
    }, 2000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [listeningInCurrentClub]);

  const startListening = useCallback(async (reader: LiveReader): Promise<ClubListeningState> => {
    const playbackState = await waitForReaderPlaybackState(reader);
    const streamUrl = playbackState.streamUrl ?? await resolveReaderStreamUrl(reader);
    const nextState: ClubListeningState = {
      clubId: meta.clubId,
      bookId: meta.bookId ?? reader.bookId,
      bookTitle: meta.bookTitle,
      bookAuthor: meta.bookAuthor,
      coverUrl: meta.coverUrl,
      reader: {
        ...reader,
        streamUrl,
        isPaused: playbackState.isPaused,
      },
    };

    await joinReadingSession(reader.sessionId);
    updateListeningState(nextState);
    if (!playbackState.isPaused) {
      runBestEffort(primeIcecastPlayback(streamUrl));
    }
    return nextState;
  }, [meta.bookAuthor, meta.bookId, meta.bookTitle, meta.clubId, meta.coverUrl]);

  const stopListening = useCallback((options?: { stopPlayback?: boolean }): void => {
    const activeSessionId = currentListeningState?.reader.sessionId ?? null;

    if (options?.stopPlayback !== false) {
      stopIcecastPlayback();
    }
    updateListeningState(null);

    if (activeSessionId) {
      runBestEffort(leaveReadingSession(activeSessionId));
    }
  }, []);

  return {
    listeningState: listeningInCurrentClub,
    listeningReader: listeningInCurrentClub?.reader ?? null,
    startListening,
    stopListening,
  };
}
