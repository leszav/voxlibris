import { apiRequest } from '@/lib/queryClient';

export interface PushSettings {
  userId: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  sessionStarted: boolean;
  sessionReminder: boolean;
  clubDiscussion: boolean;
  mentionInChat: boolean;
  dmReceived: boolean;
  newFollower: boolean;
  streakReminder: boolean;
  achievementUnlocked: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  updatedAt: string;
}

export const pushApi = {
  getVapidKey: () => apiRequest<{ publicKey: string | null; configured: boolean }>('/api/push/vapid-key'),
  subscribe: (subscription: PushSubscriptionJSON & { deviceName?: string }) =>
    apiRequest<{ success: boolean }>('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
    }),
  unsubscribe: (endpoint?: string) =>
    apiRequest<{ success: boolean }>('/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify(endpoint ? { endpoint } : {}),
    }),
  getSettings: () => apiRequest<{ settings: PushSettings }>('/api/push/settings'),
  updateSettings: (updates: Partial<PushSettings>) =>
    apiRequest<{ settings: PushSettings }>('/api/push/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  sendTest: () => apiRequest<{ success: boolean; sent: number; skipped: boolean }>('/api/push/test', { method: 'POST' }),
};
