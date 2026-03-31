import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyReaderSettings,
  cleanupReaderSettings,
  DEFAULT_READER_SETTINGS,
  loadReaderSettingsFromStorage,
  normalizeReaderSettings,
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

export function useSyncedReaderSettings(
  scope: ReaderSettingsScope,
  options: UseSyncedReaderSettingsOptions = {}
): UseSyncedReaderSettingsReturn {
  const { cleanupOnUnmount = false, enableServerSync = true } = options;
  
  // Initialize sync manager
  const syncManagerRef = useRef(createReaderSettingsSyncManager(loadReaderSettingsFromStorage()));
  const syncManager = syncManagerRef.current;
  
  // Local state for sync manager state
  const [syncState, setSyncState] = useState<ReaderSettingsState>(syncManager.getState());
  
  // React Query for initial server load (only used once on mount)
  const { refetch: _refetchFromServer, isFetching } = useReaderSettings();
  const [isInitialLoading, setIsInitialLoading] = useState(enableServerSync);
  
  // Subscribe to sync manager state changes
  useEffect(() => {
    const unsubscribe = syncManager.subscribe((newState) => {
      setSyncState(newState);
    });
    
    return unsubscribe;
  }, [syncManager]);
  
  // Apply settings to DOM when they change
  useEffect(() => {
    applyReaderSettings(syncState.settings, scope);
  }, [syncState.settings, scope]);

  useEffect(() => {
    const reapplySettings = () => {
      applyReaderSettings(syncState.settings, scope);
    };

    window.addEventListener("resize", reapplySettings);
    window.addEventListener("orientationchange", reapplySettings);

    return () => {
      window.removeEventListener("resize", reapplySettings);
      window.removeEventListener("orientationchange", reapplySettings);
    };
  }, [syncState.settings, scope]);

  // Load initial settings from server (only once on mount)
  useEffect(() => {
    if (!enableServerSync) {
      setIsInitialLoading(false);
      return;
    }
    
    const loadInitialSettings = async () => {
      try {
        const serverSettings = await syncManager.loadFromServer();
        applyReaderSettings(serverSettings, scope);
      } catch (error) {
        console.warn('Failed to load initial settings from server:', error);
        // Continue with local settings
      } finally {
        setIsInitialLoading(false);
      }
    };
    
    loadInitialSettings();
  }, [syncManager, scope, enableServerSync]);
  
  // Handle visibility change to sync settings when user returns
  useEffect(() => {
    if (!enableServerSync) return;
    
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
    window.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncManager, scope, enableServerSync]);
  
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
      // Local-only mode - just apply and persist locally
      const normalizedSettings = normalizeReaderSettings(nextSettings);
      applyReaderSettings(normalizedSettings, scope);
      setSyncState(prev => ({
        ...prev,
        settings: normalizedSettings,
      }));
      return;
    }
    
    // Offline-first update with server sync
    syncManager.updateSettings(nextSettings, (settings) => {
      applyReaderSettings(settings, scope);
    });
  }, [syncManager, scope, enableServerSync]);
  
  const resetSettings = useCallback(() => {
    updateSettings(DEFAULT_READER_SETTINGS);
  }, [updateSettings]);
  
  const forcSync = useCallback(async () => {
    if (!enableServerSync) return;
    await syncManager.forcSync();
  }, [syncManager, enableServerSync]);
  
  const refetchReaderSettings = useCallback(() => {
    if (!enableServerSync) return;
    
    // Force reload from server
    syncManager.loadFromServer().then(settings => {
      applyReaderSettings(settings, scope);
    }).catch(error => {
      console.error('Failed to refetch settings:', error);
    });
  }, [syncManager, scope, enableServerSync]);
  
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
  const syncManager = getReaderSettingsSyncManager();
  const [syncState, setSyncState] = useState<ReaderSettingsState>(
    syncManager?.getState() ?? {
      settings: DEFAULT_READER_SETTINGS,
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
