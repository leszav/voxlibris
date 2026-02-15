import { useCallback, useEffect, useRef, useState } from "react";
import type { ReaderProgressPayload } from "./reader-progress-core";

interface MutationCallbacks {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

interface UseReaderSyncStateOptions {
  saveProgress: (payload: ReaderProgressPayload, callbacks?: MutationCallbacks) => void;
  errorResetMs?: number;
}

export function useReaderSyncState({
  saveProgress,
  errorResetMs = 3000,
}: UseReaderSyncStateOptions) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveWithSync = useCallback((payload: ReaderProgressPayload) => {
    setIsSyncing(true);
    setSyncError(null);

    saveProgress(payload, {
      onSuccess: () => {
        setIsSyncing(false);
        setLastSyncTime(Date.now());
      },
      onError: (error) => {
        setIsSyncing(false);
        setSyncError(error instanceof Error ? error.message : "Ошибка сохранения прогресса");
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
        }
        errorTimeoutRef.current = setTimeout(() => setSyncError(null), errorResetMs);
      },
    });
  }, [errorResetMs, saveProgress]);

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveWithSync,
    isSyncing,
    syncError,
    lastSyncTime,
  };
}
