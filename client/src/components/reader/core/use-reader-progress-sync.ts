import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  canRestorePositionForChapter,
  createReaderProgressPayload,
  parseReaderPosition,
  type ReaderProgressPayload,
} from "./reader-progress-core";

interface SaveNowOptions {
  chapter?: number;
  progressOverride?: number;
}

interface UseDebouncedReaderProgressSaveOptions {
  scrollContainerRef: RefObject<HTMLElement | null>;
  currentChapter: number | null;
  totalChapters: number;
  onSave: (payload: ReaderProgressPayload) => void;
  debounceMs?: number;
  enabled?: boolean;
}

interface UseRestoreReaderScrollOptions {
  scrollContainerRef: RefObject<HTMLElement | null>;
  currentChapter: number | null;
  currentPositionRaw?: string | null;
  contentReady: boolean;
  delayMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

interface RestoreReaderScrollPositionOptions {
  scrollContainerRef: RefObject<HTMLElement | null>;
  currentChapter: number | null;
  currentPositionRaw?: string | null;
  delayMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

function scheduleReaderScrollRestore({
  scrollContainerRef,
  currentChapter,
  currentPositionRaw,
  delayMs = 300,
  retryAttempts = 4,
  retryDelayMs = 150,
}: RestoreReaderScrollPositionOptions): () => void {
  let restoreTimeout: ReturnType<typeof setTimeout> | null = null;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;

  if (currentChapter === null || !currentPositionRaw) {
    return () => {
      if (restoreTimeout) {
        clearTimeout(restoreTimeout);
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }

  const position = parseReaderPosition(currentPositionRaw);
  if (!position || !canRestorePositionForChapter(position, currentChapter)) {
    return () => {
      if (restoreTimeout) {
        clearTimeout(restoreTimeout);
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }

  const normalizedSavedScrollTop = Math.max(0, position.scrollTop);
  const savedScrollable = typeof position.scrollHeight === "number" && typeof position.clientHeight === "number"
    ? Math.max(1, position.scrollHeight - position.clientHeight)
    : null;
  let attemptsLeft = retryAttempts;

  const restorePosition = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const targetScrollTop = savedScrollable !== null
      ? Math.round(
          Math.min(1, normalizedSavedScrollTop / savedScrollable) *
            Math.max(1, container.scrollHeight - container.clientHeight)
        )
      : normalizedSavedScrollTop;

    container.scrollTop = targetScrollTop;
    const restored = Math.abs(container.scrollTop - targetScrollTop) <= 2;

    if (!restored && attemptsLeft > 0) {
      attemptsLeft -= 1;
      retryTimeout = setTimeout(restorePosition, retryDelayMs);
    }
  };

  restoreTimeout = setTimeout(restorePosition, delayMs);

  return () => {
    if (restoreTimeout) {
      clearTimeout(restoreTimeout);
    }
    if (retryTimeout) {
      clearTimeout(retryTimeout);
    }
  };
}

export function restoreReaderScrollPosition(options: RestoreReaderScrollPositionOptions): () => void {
  return scheduleReaderScrollRestore(options);
}

export function useDebouncedReaderProgressSave({
  scrollContainerRef,
  currentChapter,
  totalChapters,
  onSave,
  debounceMs = 1000,
  enabled = true,
}: UseDebouncedReaderProgressSaveOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const saveNow = useCallback((options?: SaveNowOptions) => {
    if (!enabled) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const chapterToSave = options?.chapter ?? currentChapter;
    if (chapterToSave === null) return;

    const payload = createReaderProgressPayload({
      currentChapter: chapterToSave,
      totalChapters,
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      progressOverride: options?.progressOverride,
    });

    onSave(payload);
  }, [enabled, scrollContainerRef, currentChapter, totalChapters, onSave]);

  const scheduleSave = useCallback(() => {
    if (!enabled) return;

    cancelPendingSave();
    timeoutRef.current = setTimeout(() => {
      saveNow();
    }, debounceMs);
  }, [enabled, debounceMs, cancelPendingSave, saveNow]);

  useEffect(() => {
    return () => {
      cancelPendingSave();
    };
  }, [cancelPendingSave]);

  return {
    scheduleSave,
    saveNow,
    cancelPendingSave,
  };
}

export function useRestoreReaderScroll({
  scrollContainerRef,
  currentChapter,
  currentPositionRaw,
  contentReady,
  delayMs = 300,
  retryAttempts = 4,
  retryDelayMs = 150,
}: UseRestoreReaderScrollOptions) {
  const settledChaptersRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!contentReady || currentChapter === null || !currentPositionRaw) {
      if (contentReady && currentChapter !== null) {
        settledChaptersRef.current.add(currentChapter);
      }
      return () => undefined;
    }

    if (settledChaptersRef.current.has(currentChapter)) {
      return () => undefined;
    }

    const position = parseReaderPosition(currentPositionRaw);
    if (!position || !canRestorePositionForChapter(position, currentChapter)) {
      settledChaptersRef.current.add(currentChapter);
      return () => undefined;
    }

    settledChaptersRef.current.add(currentChapter);
    return scheduleReaderScrollRestore({
      scrollContainerRef,
      currentChapter,
      currentPositionRaw,
      delayMs,
      retryAttempts,
      retryDelayMs,
    });
  }, [
    contentReady,
    currentChapter,
    currentPositionRaw,
    scrollContainerRef,
    delayMs,
    retryAttempts,
    retryDelayMs,
  ]);
}
