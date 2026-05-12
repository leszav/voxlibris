import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
  InfiniteData,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { feedApi } from '@/api/feed';
import type { FeedResponse, FeedEvent } from '@/api/feed';
import { getAccessToken, syncTokenFromCookie } from '@/lib/token-store';

// ── Бесконечная лента ──────────────────────────────────────────────────────

export function useFeed(limit = 20, userId?: string) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) =>
      feedApi.getFeed(limit, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: FeedResponse) => lastPage.nextCursor ?? undefined,
    staleTime: 60_000,
    enabled: !!userId,
  });

  // Real-time: подключаемся к главному Socket.IO, присоединяемся к user room
  useEffect(() => {
    if (!userId) return;

    syncTokenFromCookie();
    const token = getAccessToken();

    const socket = io('/', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: token ? { token } : undefined,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_user_room', userId);
    });

    const handler = (payload: { event: FeedEvent; unseenCount: number }) => {
      queryClient.setQueryData<InfiniteData<FeedResponse>>(
        ['feed'],
        (old) => {
          if (!old) return old;
          const [firstPage, ...rest] = old.pages;
          return {
            ...old,
            pages: [
              {
                ...firstPage,
                events: [payload.event, ...(firstPage?.events ?? [])],
              },
              ...rest,
            ],
          };
        },
      );
      queryClient.setQueryData(['feed', 'unseenCount'], payload.unseenCount);
    };

    socket.on('feed:new_event', handler);

    return () => {
      socket.off('feed:new_event', handler);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, queryClient]);

  return query;
}

// ── Счётчик непрочитанных ──────────────────────────────────────────────────

export function useFeedUnseenCount(enabled = true) {
  return useQuery({
    queryKey: ['feed', 'unseenCount'],
    queryFn: async () => {
      const res = await feedApi.getUnseenCount();
      return res.count;
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ── Пометить просмотренной ──────────────────────────────────────────────────

export function useMarkFeedSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => feedApi.markSeen(),
    onSuccess: () => {
      queryClient.setQueryData(['feed', 'unseenCount'], 0);
    },
  });
}

// ── Активность конкретного пользователя ────────────────────────────────────

export function useUserActivity(userId: string, limit = 20, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['activity', userId],
    queryFn: ({ pageParam }) =>
      feedApi.getUserActivity(userId, limit, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: FeedResponse) => lastPage.nextCursor ?? undefined,
    enabled: enabled && !!userId,
    staleTime: 60_000,
  });
}
