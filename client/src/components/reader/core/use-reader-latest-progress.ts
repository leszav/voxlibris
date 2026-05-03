import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  createReaderProgressPayload,
  getReaderProgressSignature,
  parseReaderPosition,
} from "./reader-progress-core";

interface RemoteReadingProgress {
  currentChapter: number;
  currentPosition: string;
  progress: number;
}

interface UseReaderLatestProgressOptions {
  currentChapter: number | null;
  totalChapters: number;
  scrollContainerRef: RefObject<HTMLElement | null>;
  remoteProgress?: RemoteReadingProgress | null;
  refreshProgress: () => Promise<unknown>;
  enabled?: boolean;
  hasLocalReadingActivity?: boolean;
  isLocalSessionProgress?: (progress: RemoteReadingProgress) => boolean;
}

function isRemoteProgressAhead(
  remoteProgress: RemoteReadingProgress,
  currentChapter: number | null,
  totalChapters: number,
  scrollContainerRef: RefObject<HTMLElement | null>
): boolean {
  if (currentChapter === null) {
    return false;
  }

  const container = scrollContainerRef.current;
  if (!container) {
    return remoteProgress.currentChapter > currentChapter;
  }

  const localPayload = createReaderProgressPayload({
    currentChapter,
    totalChapters,
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
  });

  if (remoteProgress.currentChapter > localPayload.currentChapter) {
    return true;
  }

  if (remoteProgress.currentChapter < localPayload.currentChapter) {
    return false;
  }

  if (remoteProgress.progress > localPayload.progress + 1) {
    return true;
  }

  if (remoteProgress.progress < localPayload.progress - 1) {
    return false;
  }

  const remotePosition = parseReaderPosition(remoteProgress.currentPosition);
  if (!remotePosition || remotePosition.chapter !== currentChapter) {
    return false;
  }

  const localScrollable = Math.max(1, container.scrollHeight - container.clientHeight);
  const remoteScrollable = typeof remotePosition.scrollHeight === "number" && typeof remotePosition.clientHeight === "number"
    ? Math.max(1, remotePosition.scrollHeight - remotePosition.clientHeight)
    : localScrollable;
  const localRatio = Math.min(1, container.scrollTop / localScrollable);
  const remoteRatio = Math.min(1, remotePosition.scrollTop / remoteScrollable);

  return remoteRatio > localRatio + 0.03;
}

export function useReaderLatestProgress({
  currentChapter,
  totalChapters,
  scrollContainerRef,
  remoteProgress,
  refreshProgress,
  enabled = true,
  hasLocalReadingActivity = true,
  isLocalSessionProgress,
}: UseReaderLatestProgressOptions) {
  const [suggestedProgress, setSuggestedProgress] = useState<RemoteReadingProgress | null>(null);
  const dismissedSignatureRef = useRef<string | null>(null);
  const refreshCooldownRef = useRef(0);
  const processedRemoteSignatureRef = useRef<string | null>(null);

  const remoteSignature = useMemo(
    () => (remoteProgress ? getReaderProgressSignature(remoteProgress) : null),
    [remoteProgress]
  );

  const dismissSuggestion = useCallback(() => {
    if (remoteProgress) {
      dismissedSignatureRef.current = getReaderProgressSignature(remoteProgress);
    }
    setSuggestedProgress(null);
  }, [remoteProgress]);

  useEffect(() => {
    if (!enabled || !remoteProgress || currentChapter === null || totalChapters <= 0 || !hasLocalReadingActivity) {
      setSuggestedProgress(null);
      return;
    }

    if (isLocalSessionProgress?.(remoteProgress)) {
      setSuggestedProgress((current) => (
        current && getReaderProgressSignature(current) === remoteSignature ? null : current
      ));
      processedRemoteSignatureRef.current = remoteSignature;
      return;
    }

    if (processedRemoteSignatureRef.current === remoteSignature) {
      return;
    }

    processedRemoteSignatureRef.current = remoteSignature;

    if (dismissedSignatureRef.current === remoteSignature) {
      return;
    }

    if (isRemoteProgressAhead(remoteProgress, currentChapter, totalChapters, scrollContainerRef)) {
      setSuggestedProgress(remoteProgress);
      return;
    }

    setSuggestedProgress((current) => (
      current && getReaderProgressSignature(current) === remoteSignature ? null : current
    ));
  }, [
    currentChapter,
    enabled,
    hasLocalReadingActivity,
    isLocalSessionProgress,
    remoteProgress,
    remoteSignature,
    scrollContainerRef,
    totalChapters,
  ]);

  useEffect(() => {
    if (!enabled || !suggestedProgress || currentChapter === null || totalChapters <= 0 || !hasLocalReadingActivity) {
      if (!hasLocalReadingActivity) {
        setSuggestedProgress(null);
      }
      return;
    }

    if (isLocalSessionProgress?.(suggestedProgress)) {
      setSuggestedProgress(null);
      return;
    }

    if (!isRemoteProgressAhead(suggestedProgress, currentChapter, totalChapters, scrollContainerRef)) {
      setSuggestedProgress(null);
    }
  }, [
    currentChapter,
    enabled,
    hasLocalReadingActivity,
    isLocalSessionProgress,
    scrollContainerRef,
    suggestedProgress,
    totalChapters,
  ]);

  useEffect(() => {
    if (!enabled) return;

    const requestRefresh = () => {
      const now = Date.now();
      if (now - refreshCooldownRef.current < 1200) {
        return;
      }
      refreshCooldownRef.current = now;
      void refreshProgress();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestRefresh();
      }
    };

    window.addEventListener("focus", requestRefresh);
    window.addEventListener("online", requestRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", requestRefresh);
      window.removeEventListener("online", requestRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, refreshProgress]);

  return {
    suggestedProgress,
    dismissSuggestion,
  };
}
