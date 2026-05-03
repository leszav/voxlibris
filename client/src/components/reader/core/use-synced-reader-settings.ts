import { useCallback, useEffect, useState } from "react";
import {
  applyReaderSettings,
  cleanupReaderSettings,
  DEFAULT_READER_SETTINGS,
  MOBILE_DEFAULT_READER_SETTINGS,
  isMobileReaderViewport,
  loadReaderSettingsFromStorage,
  normalizeReaderSettings,
  saveReaderSettingsToStorage,
  type ReaderSettings,
  type ReaderSettingsScope,
} from "@/lib/reader-settings";
import {
  createReaderSettingsSyncManager,
  getReaderSettingsSyncManager,
  type ReaderSettingsState,
  type SyncStatus,
} from "@/lib/reader-settings-sync";
import { useReaderSettings } from "@/hooks/use-reader";

interface UseSyncedReaderSettingsOptions {
  cleanupOnUnmount?: boolean;
  enableServerSync?: boolean;
}

interface UseSyncedReaderSettingsReturn {
  settings: ReaderSettings;
  updateSettings: (settings: ReaderSettings) => void;
  resetSettings: () => void;
  syncStatus: SyncStatus;
  isLoading: boolean;
  lastSyncAt: number;
  errorMessage?: string;
  forcSync: () => Promise<void>;
  refetchReaderSettings: () => void;
}

function createLocalReaderSettingsState(settings: ReaderSettings): ReaderSettingsState {
  return {
    settings,
    syncStatus: "synced",
    lastSyncAt: Date.now(),
  };
}

export function useSyncedReaderSettings(
  scope: ReaderSettingsScope,
  options: UseSyncedReaderSettingsOptions = {}
): UseSyncedReaderSettingsReturn {
  const { cleanupOnUnmount = false, enableServerSync = true } = options;
  const [isMobileMode, setIsMobileMode] = useState(() => isMobileReaderViewport());

  const getSyncManager = useCallback(() => {
    const currentDeviceMode = isMobileMode ? "mobile" : "desktop";
    return createReaderSettingsSyncManager(loadReaderSettingsFromStorage(currentDeviceMode), currentDeviceMode);
  }, [isMobileMode]);

  const [syncState, setSyncState] = useState<ReaderSettingsState>(() => {
    const initialSettings = loadReaderSettingsFromStorage(isMobileReaderViewport() ? "mobile" : "desktop");
    return createLocalReaderSettingsState(initialSettings);
  });

  const serverSyncEnabled = enableServerSync;
  const deviceMode = isMobileMode ? "mobile" : "desktop";
  const { refetch: _refetchFromServer, isFetching } = useReaderSettings(serverSyncEnabled, deviceMode);
  const [isInitialLoading, setIsInitialLoading] = useState(serverSyncEnabled);

  useEffect(() => {
    const updateViewportMode = () => {
      setIsMobileMode(isMobileReaderViewport());
    };

    globalThis.addEventListener("resize", updateViewportMode);
    globalThis.addEventListener("orientationchange", updateViewportMode);

    return () => {
      globalThis.removeEventListener("resize", updateViewportMode);
      globalThis.removeEventListener("orientationchange", updateViewportMode);
    };
  }, []);

  // Subscribe to sync manager state changes
  useEffect(() => {
    const syncManager = getSyncManager();
    setSyncState(syncManager.getState());

    const unsubscribe = syncManager.subscribe((newState) => {
      setSyncState(newState);
    });

    return unsubscribe;
  }, [getSyncManager]);
  
  // Apply settings to DOM when they change
  useEffect(() => {
    applyReaderSettings(syncState.settings, scope);
  }, [syncState.settings, scope]);

  useEffect(() => {
    const reapplySettings = () => {
      applyReaderSettings(syncState.settings, scope);
    };

    globalThis.addEventListener("resize", reapplySettings);
    globalThis.addEventListener("orientationchange", reapplySettings);

    return () => {
      globalThis.removeEventListener("resize", reapplySettings);
      globalThis.removeEventListener("orientationchange", reapplySettings);
    };
  }, [syncState.settings, scope]);

  // Load initial settings from server (only once on mount)
  useEffect(() => {
    if (!serverSyncEnabled) {
      setIsInitialLoading(false);
      return;
    }

    const syncManager = getSyncManager();
    let cancelled = false;

    const loadInitialSettings = async () => {
      try {
        const serverSettings = await syncManager.loadFromServer();
        if (!cancelled) {
          applyReaderSettings(serverSettings, scope);
        }
      } catch (error) {
        console.warn('Failed to load initial settings from server:', error);
        // Continue with local settings
      } finally {
        if (!cancelled) {
          setIsInitialLoading(false);
        }
      }
    };

    loadInitialSettings();

    return () => {
      cancelled = true;
    };
  }, [getSyncManager, scope, serverSyncEnabled]);
  
  // Handle visibility change to sync settings when user returns
  useEffect(() => {
    if (!serverSyncEnabled) return;

    const syncManager = getSyncManager();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Load fresh settings from server when user returns
        syncManager.loadFromServer().then(settings => {
          applyReaderSettings(settings, scope);
        }).catch(error => {
          console.warn('Failed to refresh settings on focus:', error);
        });
      }
    };
    
    const handleFocus = () => handleVisibilityChange();
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    globalThis.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      globalThis.removeEventListener('focus', handleFocus);
    };
  }, [getSyncManager, scope, serverSyncEnabled]);
  
  // Cleanup on unmount
  useEffect(() => {
    if (!cleanupOnUnmount) {
      return;
    }
    
    return () => {
      cleanupReaderSettings(scope);
    };
  }, [cleanupOnUnmount, scope]);
  
  // Optimistic update function
  const updateSettings = useCallback((nextSettings: ReaderSettings) => {
    if (!enableServerSync) {
      const normalizedSettings = normalizeReaderSettings(nextSettings);
      saveReaderSettingsToStorage(normalizedSettings, isMobileMode ? "mobile" : "desktop");
      applyReaderSettings(normalizedSettings, scope);
      setSyncState(prev => ({
        ...prev,
        settings: normalizedSettings,
        syncStatus: 'synced',
        lastSyncAt: Date.now(),
        errorMessage: undefined,
      }));
      return;
    }

    const syncManager = getSyncManager();

    // Offline-first update with server sync
    syncManager.updateSettings(nextSettings, (settings) => {
      applyReaderSettings(settings, scope);
    });
  }, [enableServerSync, getSyncManager, isMobileMode, scope]);
  
  const resetSettings = useCallback(() => {
    updateSettings(isMobileMode ? MOBILE_DEFAULT_READER_SETTINGS : DEFAULT_READER_SETTINGS);
  }, [isMobileMode, updateSettings]);
  
  const forcSync = useCallback(async () => {
    if (!serverSyncEnabled) return;
    const syncManager = getSyncManager();
    await syncManager.forcSync();
  }, [getSyncManager, serverSyncEnabled]);
  
  const refetchReaderSettings = useCallback(() => {
    if (!serverSyncEnabled) return;

    const syncManager = getSyncManager();

    // Force reload from server
    syncManager.loadFromServer().then(settings => {
      applyReaderSettings(settings, scope);
    }).catch(error => {
      console.error('Failed to refetch settings:', error);
    });
  }, [getSyncManager, scope, serverSyncEnabled]);
  
  return {
    settings: syncState.settings,
    updateSettings,
    resetSettings,
    syncStatus: syncState.syncStatus,
    isLoading: isInitialLoading || isFetching,
    lastSyncAt: syncState.lastSyncAt,
    errorMessage: syncState.errorMessage,
    forcSync,
    refetchReaderSettings,
  };
}

/**
 * Hook for components that need sync status information
 */
export function useReaderSettingsSyncStatus(): {
  syncStatus: SyncStatus;
  lastSyncAt: number;
  errorMessage?: string;
  pendingCount: number;
  forcSync: () => Promise<void>;
} {
  const isMobileMode = isMobileReaderViewport();
  const deviceMode = isMobileMode ? "mobile" : "desktop";
  const syncManager = getReaderSettingsSyncManager(deviceMode);
  const [syncState, setSyncState] = useState<ReaderSettingsState>(
    syncManager?.getState() ?? {
      settings: isMobileMode ? MOBILE_DEFAULT_READER_SETTINGS : DEFAULT_READER_SETTINGS,
      syncStatus: 'synced',
      lastSyncAt: Date.now(),
    }
  );
  const [queueStatus, setQueueStatus] = useState({ pendingCount: 0, isProcessing: false });
  
  useEffect(() => {
    if (!syncManager) return;
    
    const unsubscribe = syncManager.subscribe((newState) => {
      setSyncState(newState);
    });
    
    // Update queue status periodically
    const interval = setInterval(() => {
      setQueueStatus(syncManager.getQueueStatus());
    }, 1000);
    
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [syncManager]);
  
  const forcSync = useCallback(async () => {
    if (!syncManager) return;
    await syncManager.forcSync();
  }, [syncManager]);
  
  return {
    syncStatus: syncState.syncStatus,
    lastSyncAt: syncState.lastSyncAt,
    errorMessage: syncState.errorMessage,
    pendingCount: queueStatus.pendingCount,
    forcSync,
  };
}
