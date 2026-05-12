import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialApi } from '@/api/social';
import type { FollowStatus, PrivacySettings } from '@/api/social';

type CachedFollowStatus = Partial<FollowStatus> & {
  success?: boolean;
};

// ── Follow Status ──────────────────────────────────────────────────────────

export function useFollowStatus(targetUserId: string, enabled = true) {
  return useQuery({
    queryKey: ['social', 'follow-status', targetUserId],
    queryFn: () => socialApi.getFollowStatus(targetUserId),
    enabled: enabled && !!targetUserId,
    staleTime: 30_000,
  });
}

export function useFollowMutation(targetUserId: string) {
  const queryClient = useQueryClient();

  const follow = useMutation({
    mutationFn: () => socialApi.follow(targetUserId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['social', 'follow-status', targetUserId] });
      const prev = queryClient.getQueryData(['social', 'follow-status', targetUserId]);
      queryClient.setQueryData<CachedFollowStatus>(['social', 'follow-status', targetUserId], (old) => ({
        ...old,
        isFollowing: true,
      }));
      return { prev };
    },
    onError: (_err: unknown, _vars: unknown, ctx: { prev: unknown } | undefined) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(['social', 'follow-status', targetUserId], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'follow-status', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['social', 'followers', targetUserId] });
    },
  });

  const unfollow = useMutation({
    mutationFn: () => socialApi.unfollow(targetUserId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['social', 'follow-status', targetUserId] });
      const prev = queryClient.getQueryData(['social', 'follow-status', targetUserId]);
      queryClient.setQueryData<CachedFollowStatus>(['social', 'follow-status', targetUserId], (old) => ({
        ...old,
        isFollowing: false,
      }));
      return { prev };
    },
    onError: (_err: unknown, _vars: unknown, ctx: { prev: unknown } | undefined) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(['social', 'follow-status', targetUserId], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'follow-status', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['social', 'followers', targetUserId] });
    },
  });

  return { follow, unfollow };
}

// ── Followers / Following Lists ────────────────────────────────────────────

export function useFollowers(userId: string, enabled = true) {
  return useQuery({
    queryKey: ['social', 'followers', userId],
    queryFn: () => socialApi.getFollowers(userId),
    enabled: enabled && !!userId,
    staleTime: 60_000,
  });
}

export function useFollowing(userId: string, enabled = true) {
  return useQuery({
    queryKey: ['social', 'following', userId],
    queryFn: () => socialApi.getFollowing(userId),
    enabled: enabled && !!userId,
    staleTime: 60_000,
  });
}

// ── Block ──────────────────────────────────────────────────────────────────

export function useBlockMutation(targetUserId: string) {
  const queryClient = useQueryClient();

  const block = useMutation({
    mutationFn: () => socialApi.block(targetUserId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'follow-status', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['social', 'blocks'] });
    },
  });

  const unblock = useMutation({
    mutationFn: () => socialApi.unblock(targetUserId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['social', 'blocks'] });
    },
  });

  return { block, unblock };
}

// ── Mute ───────────────────────────────────────────────────────────────────

export function useMuteMutation(targetUserId: string) {
  const mute = useMutation({
    mutationFn: () => socialApi.mute(targetUserId),
  });
  const unmute = useMutation({
    mutationFn: () => socialApi.unmute(targetUserId),
  });
  return { mute, unmute };
}

// ── Privacy Settings ───────────────────────────────────────────────────────

export function usePrivacySettings() {
  return useQuery({
    queryKey: ['social', 'privacy'],
    queryFn: async () => {
      const res = await socialApi.getPrivacySettings();
      return res.settings;
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdatePrivacySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<Omit<PrivacySettings, 'userId' | 'updatedAt'>>) =>
      socialApi.updatePrivacySettings(updates),
    onSuccess: (data) => {
      queryClient.setQueryData(['social', 'privacy'], data.settings);
    },
  });
}
