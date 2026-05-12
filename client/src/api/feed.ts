import { apiRequest } from '@/lib/queryClient';

export interface FeedActor {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  isReader: boolean;
}

export interface FeedEvent {
  id: string;
  actorId: string;
  eventType:
    | 'session_started'
    | 'session_ended'
    | 'joined_club'
    | 'left_club'
    | 'club_created'
    | 'reading_completed'
    | 'book_review_posted'
    | 'achievement_unlocked'
    | 'club_session_scheduled'
    | 'discussion_hot'
    | 'followed_user'
    | 'book_added_to_club';
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  visibility: 'public' | 'followers' | 'private';
  createdAt: string;
  actor: FeedActor;
}

export interface FeedResponse {
  success: boolean;
  events: FeedEvent[];
  nextCursor: string | null;
}

export const feedApi = {
  getFeed: (limit = 20, cursor?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return apiRequest<FeedResponse>(`/api/feed?${params}`);
  },

  getUnseenCount: () =>
    apiRequest<{ success: boolean; count: number }>('/api/feed/unseen-count'),

  markSeen: () =>
    apiRequest<{ success: boolean }>('/api/feed/mark-seen', { method: 'POST' }),

  getUserActivity: (userId: string, limit = 20, cursor?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return apiRequest<FeedResponse>(`/api/feed/activity/${userId}?${params}`);
  },
};
