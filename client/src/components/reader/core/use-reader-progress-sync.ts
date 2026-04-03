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

function isScrollIntentKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }

  return (
    event.key === " " ||
    event.code === "Space" ||
    event.key === "PageDown" ||
    event.key === "PageUp" ||
    event.key === "ArrowDown" ||
    event.key === "ArrowUp" ||
    event.key === "Home" ||
    event.key === "End"
  );
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
  let userInteracted = false;
  const container = scrollContainerRef.current;

  const detachInteractionListeners = () => {
    if (!container) {
      document.removeEventListener("keydown", handleKeyDown);
      return;
    }

    container.removeEventListener("wheel", markUserInteraction);
    container.removeEventListener("touchstart", markUserInteraction);
    container.removeEventListener("pointerdown", markUserInteraction);
    document.removeEventListener("keydown", handleKeyDown);
  };

  const markUserInteraction = () => {
    userInteracted = true;
    detachInteractionListeners();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isScrollIntentKey(event)) {
      markUserInteraction();
    }
  };

  container?.addEventListener("wheel", markUserInteraction, { passive: true });
  container?.addEventListener("touchstart", markUserInteraction, { passive: true });
  container?.addEventListener("pointerdown", markUserInteraction, { passive: true });
  document.addEventListener("keydown", handleKeyDown);

  const restorePosition = () => {
    if (userInteracted) return;

    if (!container) return;

    let targetScrollTop = normalizedSavedScrollTop;

    if (savedScrollable !== null) {
      targetScrollTop = Math.round(
        Math.min(1, normalizedSavedScrollTop / savedScrollable) *
          Math.max(1, container.scrollHeight - container.clientHeight)
      );
    }

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

    detachInteractionListeners();
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
  const restoredChaptersRef = useRef<Set<number>>(new Set());
  const interactedChaptersRef = useRef<Set<number>>(new Set());
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (currentChapter === null) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const markInteracted = () => {
      interactedChaptersRef.current.add(currentChapter);
    };

    container.addEventListener("scroll", markInteracted, { passive: true });

    return () => {
      container.removeEventListener("scroll", markInteracted);
    };
  }, [currentChapter, scrollContainerRef]);

  useEffect(() => {
    if (currentChapter === null) return;

    if (restoredChaptersRef.current.has(currentChapter)) {
      return;
    }

    if (interactedChaptersRef.current.has(currentChapter)) {
      restoredChaptersRef.current.add(currentChapter);
      return;
    }

    if (!contentReady || !currentPositionRaw) {
      return;
    }

    const position = parseReaderPosition(currentPositionRaw);
    if (!position || !canRestorePositionForChapter(position, currentChapter)) {
      restoredChaptersRef.current.add(currentChapter);
      return;
    }

    restoredChaptersRef.current.add(currentChapter);
    if (cleanupRef.current) {
      cleanupRef.current();
    }
    cleanupRef.current = scheduleReaderScrollRestore({
      scrollContainerRef,
      currentChapter,
      currentPositionRaw,
      delayMs,
      retryAttempts,
      retryDelayMs,
    });
  }, [contentReady, currentChapter, currentPositionRaw, scrollContainerRef, delayMs, retryAttempts, retryDelayMs]);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);
}
