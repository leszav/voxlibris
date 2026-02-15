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
  useEffect(() => {
    let restoreTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    if (!contentReady || currentChapter === null || !currentPositionRaw) {
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

    const targetScrollTop = Math.max(0, position.scrollTop);
    let attemptsLeft = retryAttempts;

    const restorePosition = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      container.scrollTop = targetScrollTop;
      const restored = Math.abs(container.scrollTop - targetScrollTop) <= 2;

      // Повторяем восстановление, если верстка еще не стабилизировалась.
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
