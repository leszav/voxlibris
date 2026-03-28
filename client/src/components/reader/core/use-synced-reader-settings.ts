import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyReaderSettings,
  cleanupReaderSettings,
  DEFAULT_READER_SETTINGS,
  loadReaderSettingsFromStorage,
  normalizeReaderSettings,
  saveReaderSettingsToStorage,
  type ReaderSettings,
  type ReaderSettingsScope,
} from "@/lib/reader-settings";
import { useReaderSettings, useUpdateReaderSettings } from "@/hooks/use-reader";

interface UseSyncedReaderSettingsOptions {
  cleanupOnUnmount?: boolean;
}

export function useSyncedReaderSettings(
  scope: ReaderSettingsScope,
  options: UseSyncedReaderSettingsOptions = {}
) {
  const { cleanupOnUnmount = false } = options;
  const [settings, setSettings] = useState<ReaderSettings>(() => loadReaderSettingsFromStorage());
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: remoteSettings, isLoading, refetch, isFetching } = useReaderSettings();
  const { mutate: saveRemoteSettings, isPending: isSaving } = useUpdateReaderSettings();

  const applyAndPersistLocal = useCallback((nextInput: unknown) => {
    const nextSettings = normalizeReaderSettings(nextInput);
    setSettings(nextSettings);
    saveReaderSettingsToStorage(nextSettings);
    applyReaderSettings(nextSettings, scope);
    return nextSettings;
  }, [scope]);

  useEffect(() => {
    applyAndPersistLocal(loadReaderSettingsFromStorage());
  }, [applyAndPersistLocal]);

  useEffect(() => {
    if (!remoteSettings) {
      return;
    }

    applyAndPersistLocal(remoteSettings);
  }, [applyAndPersistLocal, remoteSettings]);

  useEffect(() => {
    const refetchSettings = () => {
      void refetch();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refetchSettings();
      }
    };

    globalThis.addEventListener("focus", refetchSettings);
    globalThis.addEventListener("online", refetchSettings);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      globalThis.removeEventListener("focus", refetchSettings);
      globalThis.removeEventListener("online", refetchSettings);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refetch]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!cleanupOnUnmount) {
      return;
    }

    return () => {
      cleanupReaderSettings(scope);
    };
  }, [cleanupOnUnmount, scope]);

  const updateSettings = useCallback((nextSettings: ReaderSettings) => {
    const normalizedSettings = applyAndPersistLocal(nextSettings);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveRemoteSettings(normalizedSettings);
      saveTimeoutRef.current = null;
    }, 400);
  }, [applyAndPersistLocal, saveRemoteSettings]);

  const resetSettings = useCallback(() => {
    updateSettings(DEFAULT_READER_SETTINGS);
  }, [updateSettings]);

  return {
    settings,
    updateSettings,
    resetSettings,
    refetchReaderSettings: refetch,
    isLoading,
    isSaving: isSaving || isFetching,
  };
}
