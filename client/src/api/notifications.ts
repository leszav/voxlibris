import { apiRequest } from '@/lib/queryClient';

export interface NotificationSettings {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  reminderMinutes: number;
  sessionStart: boolean;
  sessionEnd: boolean;
  newQuestion: boolean;
  notifyReply: boolean;
  notifyMention: boolean;
  notifyChapterReady: boolean;
  notifyMessage: boolean;
  notifyPlanUpdate: boolean;
}

export interface UnreadSummary {
  success: boolean;
  messagesUnread: number;
  notificationsUnread: number;
  totalUnread: number;
}

export interface BellItem {
  key: string;
  kind: string;
  count: number;
  groupLabel: string;
  detail: string;
  actionUrl: string;
  latestCreatedAt: string;
}

export interface BellItemsResponse {
  success: boolean;
  items: BellItem[];
  totalUnread: number;
}

export const notificationsApi = {
  getSettings: () =>
    apiRequest<{ success: boolean; settings: NotificationSettings }>('/api/notifications/settings'),

  updateSettings: (updates: Partial<NotificationSettings>) =>
    apiRequest<{ success: boolean; settings: NotificationSettings }>('/api/notifications/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  getUnreadSummary: () =>
    apiRequest<UnreadSummary>('/api/notifications/unread-summary'),

  getBellItems: () =>
    apiRequest<BellItemsResponse>('/api/notifications/bell-items'),

  markRead: (kind?: string) =>
    apiRequest<{ success: boolean; marked: number }>('/api/notifications/mark-read', {
      method: 'POST',
      body: JSON.stringify(kind ? { kind } : {}),
    }),
};
