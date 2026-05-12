import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications';
import type { NotificationSettings } from '@/api/notifications';

export function useNotificationSettings(enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'settings'],
    queryFn: async () => {
      const res = await notificationsApi.getSettings();
      return res.settings;
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<NotificationSettings>) => notificationsApi.updateSettings(updates),
    onSuccess: (res) => {
      queryClient.setQueryData(['notifications', 'settings'], res.settings);
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-summary'] });
    },
  });
}

export function useUnreadSummary(enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'unread-summary'],
    queryFn: () => notificationsApi.getUnreadSummary(),
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useBellItems(enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'bell-items'],
    queryFn: () => notificationsApi.getBellItems(),
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (kind?: string) => notificationsApi.markRead(kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'bell-items'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-summary'] });
    },
  });
}
