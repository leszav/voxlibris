import { apiRequest } from '@/lib/queryClient';

export interface FollowUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  isReader: boolean;
  followersCount: number;
  followingCount: number;
}

export interface FollowStatus {
  isFollowing: boolean;
  isFollower: boolean;
}

export interface PrivacySettings {
  userId: string;
  profileVisibility: 'public' | 'followers' | 'private';
  readingStatsVisible: boolean;
  clubsVisible: boolean;
  readingHistoryVisible: boolean;
  allowDmFrom: 'everyone' | 'followers' | 'nobody';
  updatedAt: string;
}

export interface PaginatedUsers {
  users: FollowUser[];
  nextCursor: string | null;
}

export const socialApi = {
  follow: (userId: string) =>
    apiRequest<{ success: boolean }>(`/api/social/follow/${userId}`, { method: 'POST' }),

  unfollow: (userId: string) =>
    apiRequest<{ success: boolean }>(`/api/social/follow/${userId}`, { method: 'DELETE' }),

  getFollowStatus: (userId: string) =>
    apiRequest<FollowStatus & { success: boolean }>(`/api/social/follow-status/${userId}`),

  getFollowers: (userId: string, limit = 20, cursor?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return apiRequest<PaginatedUsers & { success: boolean }>(
      `/api/social/followers/${userId}?${params}`,
    );
  },

  getFollowing: (userId: string, limit = 20, cursor?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return apiRequest<PaginatedUsers & { success: boolean }>(
      `/api/social/following/${userId}?${params}`,
    );
  },

  block: (userId: string) =>
    apiRequest<{ success: boolean }>(`/api/social/block/${userId}`, { method: 'POST' }),

  unblock: (userId: string) =>
    apiRequest<{ success: boolean }>(`/api/social/block/${userId}`, { method: 'DELETE' }),

  getBlocks: () =>
    apiRequest<{ success: boolean; blocks: Array<{ id: string; username: string; blockedAt: string }> }>(
      '/api/social/blocks',
    ),

  mute: (userId: string) =>
    apiRequest<{ success: boolean }>(`/api/social/mute/${userId}`, { method: 'POST' }),

  unmute: (userId: string) =>
    apiRequest<{ success: boolean }>(`/api/social/mute/${userId}`, { method: 'DELETE' }),

  getPrivacySettings: () =>
    apiRequest<{ success: boolean; settings: PrivacySettings }>('/api/social/privacy'),

  updatePrivacySettings: (updates: Partial<Omit<PrivacySettings, 'userId' | 'updatedAt'>>) =>
    apiRequest<{ success: boolean; settings: PrivacySettings }>('/api/social/privacy', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
};
