import { ReaderSettings, normalizeReaderSettings, saveReaderSettingsToStorage } from './reader-settings';
import { apiRequest } from './queryClient';

export type SyncStatus = 'synced' | 'pending' | 'error' | 'offline';

export interface ReaderSettingsState {
  settings: ReaderSettings;
  syncStatus: SyncStatus;
  lastSyncAt: number;
  errorMessage?: string;
}

interface SyncQueueItem {
  settings: ReaderSettings;
  timestamp: number;
  retryCount: number;
}

interface ReaderSettingsResponse {
  settings: ReaderSettings;
}

class ReaderSettingsSyncManager {
  private queue: SyncQueueItem[] = [];
  private isProcessing = false;
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second base delay
  private listeners = new Set<(state: ReaderSettingsState) => void>();
  private state: ReaderSettingsState;
  
  constructor(initialSettings: ReaderSettings) {
    this.state = {
      settings: initialSettings,
      syncStatus: 'synced',
      lastSyncAt: Date.now(),
    };
    
    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
  }
  
  getState(): ReaderSettingsState {
    return { ...this.state };
  }
  
  subscribe(listener: (state: ReaderSettingsState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.getState()));
  }
  
  private updateState(updates: Partial<ReaderSettingsState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }
  
  private handleOnline(): void {
    if (this.state.syncStatus === 'offline') {
      this.updateState({ syncStatus: 'pending' });
      this.processQueue();
    }
  }
  
  private handleOffline(): void {
    this.updateState({ syncStatus: 'offline' });
  }
  
  /**
   * Apply settings immediately (optimistic update)
   */
  async updateSettings(settings: ReaderSettings, applyFunction: (settings: ReaderSettings) => void): Promise<void> {
    const normalizedSettings = normalizeReaderSettings(settings);
    
    // Immediate UI application
    applyFunction(normalizedSettings);
    saveReaderSettingsToStorage(normalizedSettings);
    
    // Update state optimistically
    this.updateState({
      settings: normalizedSettings,
      syncStatus: navigator.onLine ? 'pending' : 'offline',
    });
    
    // Add to sync queue
    this.enqueueSync(normalizedSettings);
  }
  
  private enqueueSync(settings: ReaderSettings): void {
    // Remove any existing items for the same settings to avoid duplicates
    this.queue = this.queue.filter(item => 
      JSON.stringify(item.settings) !== JSON.stringify(settings)
    );
    
    this.queue.push({
      settings,
      timestamp: Date.now(),
      retryCount: 0,
    });
    
    this.processQueue();
  }
  
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0 || !navigator.onLine) {
      return;
    }
    
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const item = this.queue[0];
      
      try {
        await this.syncToServer(item.settings);
        
        // Success - remove from queue
        this.queue.shift();
        this.updateState({
          syncStatus: 'synced',
          lastSyncAt: Date.now(),
          errorMessage: undefined,
        });
        
      } catch (error) {
        item.retryCount++;
        
        if (item.retryCount >= this.maxRetries) {
          // Max retries exceeded - remove from queue and mark as error
          this.queue.shift();
          this.updateState({
            syncStatus: 'error',
            errorMessage: error instanceof Error ? error.message : 'Sync failed',
          });
        } else {
          // Retry with exponential backoff
          const delay = this.retryDelay * Math.pow(2, item.retryCount - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    this.isProcessing = false;
  }
  
  private async syncToServer(settings: ReaderSettings): Promise<void> {
    const response = await apiRequest<ReaderSettingsResponse>('/api/v1/books/reader-settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
    
    // Verify server response matches what we sent
    const serverSettings = normalizeReaderSettings(response.settings);
    const sentSettings = normalizeReaderSettings(settings);
    
    if (JSON.stringify(serverSettings) !== JSON.stringify(sentSettings)) {
      console.warn('Server returned different settings than sent:', {
        sent: sentSettings,
        received: serverSettings,
      });
    }
  }
  
  /**
   * Load settings from server and merge with local state
   */
  async loadFromServer(): Promise<ReaderSettings> {
    try {
      const response = await apiRequest<ReaderSettingsResponse>('/api/v1/books/reader-settings');
      const serverSettings = normalizeReaderSettings(response.settings);
      
      // Simple conflict resolution: server wins if it's newer
      // In a more advanced implementation, we could do field-level merging
      const shouldUseServerSettings = this.shouldUseServerSettings(serverSettings);
      
      if (shouldUseServerSettings) {
        this.updateState({
          settings: serverSettings,
          syncStatus: 'synced',
          lastSyncAt: Date.now(),
        });
        saveReaderSettingsToStorage(serverSettings);
        return serverSettings;
      }
      
      return this.state.settings;
      
    } catch (error) {
      console.error('Failed to load settings from server:', error);
      this.updateState({
        syncStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Failed to load settings',
      });
      return this.state.settings;
    }
  }
  
  private shouldUseServerSettings(serverSettings: ReaderSettings): boolean {
    // If we have pending changes, don't overwrite with server settings
    if (this.state.syncStatus === 'pending' && this.queue.length > 0) {
      return false;
    }
    
    // If settings are the same, no need to update
    if (JSON.stringify(serverSettings) === JSON.stringify(this.state.settings)) {
      return false;
    }
    
    // Use server settings by default (server is source of truth)
    return true;
  }
  
  /**
   * Force sync all pending changes
   */
  async forcSync(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }
    
    // Wait for current processing to finish
    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Reset retry counts and process queue
    this.queue.forEach(item => {
      item.retryCount = 0;
    });
    
    await this.processQueue();
  }
  
  /**
   * Clear all pending syncs (useful for testing or error recovery)
   */
  clearQueue(): void {
    this.queue = [];
    this.updateState({ syncStatus: 'synced' });
  }
  
  /**
   * Get queue status for debugging
   */
  getQueueStatus(): { pendingCount: number; isProcessing: boolean } {
    return {
      pendingCount: this.queue.length,
      isProcessing: this.isProcessing,
    };
  }
}

// Singleton instance
let syncManager: ReaderSettingsSyncManager | null = null;

export function createReaderSettingsSyncManager(initialSettings: ReaderSettings): ReaderSettingsSyncManager {
  if (syncManager) {
    return syncManager;
  }
  
  syncManager = new ReaderSettingsSyncManager(initialSettings);
  return syncManager;
}

export function getReaderSettingsSyncManager(): ReaderSettingsSyncManager | null {
  return syncManager;
}
