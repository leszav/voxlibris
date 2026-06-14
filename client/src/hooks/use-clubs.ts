import type {
  Club,
  ClubInvitation,
  ClubInvitationWithInviter,
  ClubMemberRole,
  ClubWithDetails,
} from "@shared/schema";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type { ClubInvitationWithInviter } from "@shared/schema";

export interface InvitationWithClub extends Partial<ClubInvitation> {
  // Раньше API возвращал поля напрямую. Сейчас публичный endpoint
  // возвращает объект { invitation, club }, поэтому мы подстроимся
  // под ожидаемую форму внутри хука.
  clubName?: string;
  club?: {
    id: string;
    title: string;
    description: string | null;
    isPrivate: boolean;
    memberCount: number;
    maxMembers: number;
  };
  inviter?: {
    id?: string;
    username?: string;
  } | null;
}

export interface CreateClubRequest {
  title: string;
  description?: string;
  coverImage?: string;
  bookId?: string; // Книга добавляется после создания клуба
  type?: "standard" | "premium" | "reader-led";
  maxMembers?: number;
  isPrivate?: boolean;
  schedule?: string;
  settings?: string;
}

export interface UpdateClubRequest {
  title?: string;
  description?: string;
  coverImage?: string | null;
  maxMembers?: number;
  isPrivate?: boolean;
  schedule?: string;
  settings?: string;
}

export interface ClubMemberWithUser {
  id: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
  readerRating?: number | null;
  achievements?: Array<{
    achievementId: string;
    code: string;
    titleRu: string;
    iconType: "badge" | "star" | "title";
    badgeImageUrl: string | null;
  }>;
  role: ClubMemberRole;
  joinedAt: Date;
  isActive?: boolean;
  status: string;
  emailConfirmed: boolean;
  createdAt: Date;
}

export interface ClubProgress {
  progress: {
    totalChapters: number;
    currentChapter: number;
    progress: number;
  };
}

export interface ClubDetailsResponse extends ClubWithDetails {
  viewerMembershipRole?: ClubMemberRole | null;
}

export interface PublicCatalogClub {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  bookTitle: string | null;
  author: string | null;
  bookCoverUrl: string | null;
  type: string;
  isPrivate: boolean;
  isLive: boolean;
  memberCount: number;
  maxMembers: number;
  tags: string[];
  readerJoinRequestsEnabled?: boolean;
}

export interface LandingReaderClubsStatus {
  enabled: boolean;
}

export interface LandingTopReadersStatus {
  enabled: boolean;
}

// Получить все клубы для каталога (не требует аутентификации)
export function useCatalogClubs(limit?: number, searchQuery?: string) {
  const normalizedSearch = typeof searchQuery === "string" ? searchQuery.trim() : "";

  return useQuery({
    queryKey: ["catalog-clubs", limit ?? "all", normalizedSearch || "no-query"],
    queryFn: async (): Promise<PublicCatalogClub[]> => {
      const params = new URLSearchParams();

      if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
        params.set("limit", String(Math.trunc(limit)));
      }

      if (normalizedSearch) {
        params.set("q", normalizedSearch);
      }

      const queryString = params.toString();
      const url = queryString ? `/api/clubs/catalog?${queryString}` : "/api/clubs/catalog";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Failed to fetch clubs");
      }
      return res.json();
    },
    refetchInterval: 1000 * 60 * 60 * 24, // Обновлять раз в сутки (24 часа)
    refetchIntervalInBackground: false, // Не обновлять в фоне
    staleTime: 1000 * 60 * 60 * 23, // Считать данные устаревшими через 23 часа
  });
}

export function useCatalogClubsByType(type: string, limit?: number) {
  return useQuery({
    queryKey: ["catalog-clubs", type, limit ?? "all"],
    queryFn: async (): Promise<PublicCatalogClub[]> => {
      const params = new URLSearchParams({ type });

      if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
        params.set("limit", String(Math.trunc(limit)));
      }

      const res = await fetch(`/api/clubs/catalog?${params}`);
      if (!res.ok) {
        throw new Error("Failed to fetch clubs");
      }
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useLandingReaderClubsStatus() {
  return useQuery({
    queryKey: ["landing-reader-clubs-status"],
    queryFn: async (): Promise<LandingReaderClubsStatus> => {
      const res = await fetch("/api/clubs/landing-reader-clubs/status");
      if (!res.ok) {
        throw new Error("Failed to fetch landing reader clubs status");
      }
      return res.json();
    },
    staleTime: 1000 * 60,
  });
}

export function useLandingTopReadersStatus() {
  return useQuery({
    queryKey: ["landing-top-readers-status"],
    queryFn: async (): Promise<LandingTopReadersStatus> => {
      const res = await fetch("/api/readers/landing-top/status");
      if (!res.ok) {
        throw new Error("Failed to fetch landing top readers status");
      }
      return res.json();
    },
    staleTime: 1000 * 60,
  });
}

export const CATALOG_PAGE_SIZE = 12;

/**
 * Бесконечная прокрутка каталога клубов.
 * pageSize должен быть кратен количеству колонок грида, чтобы
 * строки всегда были полными. Передавайте cols * ROWS_PER_LOAD.
 * При изменении pageSize (ресайз окна) queryKey меняется и запрос сбрасывается.
 */
export function useInfiniteCatalogClubs(searchQuery?: string, pageSize = CATALOG_PAGE_SIZE) {
  const normalizedSearch = typeof searchQuery === "string" ? searchQuery.trim() : "";

  return useInfiniteQuery({
    queryKey: ["catalog-clubs-infinite", normalizedSearch || "no-query", pageSize],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<PublicCatalogClub[]> => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(pageParam),
      });
      if (normalizedSearch) params.set("q", normalizedSearch);
      const res = await fetch(`/api/clubs/catalog?${params}`);
      if (!res.ok) throw new Error("Failed to fetch clubs");
      return res.json();
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (lastPage.length < pageSize) return undefined;
      return (lastPageParam as number) + pageSize;
    },
    staleTime: 1000 * 60 * 5,
  });
}

// Получить все клубы текущего пользователя
export function useClubs() {
  return useQuery({
    queryKey: ["clubs"],
    queryFn: async (): Promise<ClubWithDetails[]> => {
      return apiRequest<ClubWithDetails[]>("/api/clubs");
    },
  });
}

// Alias для обратной совместимости
export function useUserClubs() {
  return useClubs();
}

// Получить конкретный клуб
export function useClub(clubId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["club", clubId],
    queryFn: async (): Promise<ClubDetailsResponse> => {
      return apiRequest<ClubDetailsResponse>(`/api/clubs/${clubId}`);
    },
    enabled: !!clubId && enabled,
  });
}

// Создать клуб
export function useCreateClub() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateClubRequest): Promise<Club> => {
      return apiRequest<Club>("/api/clubs", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clubs"] });
    },
  });
}

// Обновить клуб
export function useUpdateClub() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clubId,
      data,
    }: {
      clubId: string;
      data: UpdateClubRequest;
    }): Promise<Club> => {
      return apiRequest<Club>(`/api/clubs/${clubId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: ["clubs"] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
    },
  });
}

// Удалить клуб
export function useDeleteClub() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (_clubId: string): Promise<void> => {
      await apiRequest<void>(`/api/clubs/${_clubId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clubs"] });
    },
  });
}

// Получить участников клуба
export function useClubMembers(clubId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["club-members", clubId],
    queryFn: async (): Promise<ClubMemberWithUser[]> => {
      return apiRequest<ClubMemberWithUser[]>(`/api/clubs/${clubId}/members`);
    },
    enabled: !!clubId && enabled,
  });
}

// Изменить роль участника
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clubId,
      userId,
      role,
    }: {
      clubId: string;
      userId: string;
      role: ClubMemberRole;
    }) => {
      return apiRequest(`/api/clubs/${clubId}/members/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
    },
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: ["club-members", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
    },
  });
}

// Удалить участника (или выйти самому)
export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clubId, userId }: { clubId: string; userId: string }) => {
      return apiRequest(`/api/clubs/${clubId}/members/${userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, { clubId }) => {
      queryClient.invalidateQueries({ queryKey: ["club-members", clubId] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      queryClient.invalidateQueries({ queryKey: ["clubs"] });
    },
  });
}

// Alias для выхода из клуба
export function useLeaveClub() {
  return useRemoveMember();
}

// Alias для вступления (для обратной совместимости, но теперь через приглашения)
export function useJoinClub() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (_clubId: string): Promise<void> => {
      if (import.meta.env.DEV) {
        console.warn("useJoinClub: Join through invitations not yet implemented");
      }
      throw new Error("Please use invitation link to join club");
    },
    onSuccess: (_, clubId) => {
      queryClient.invalidateQueries({ queryKey: ["clubs"] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
    },
  });
}

// Получить прогресс чтения клуба (для будущей реализации)
export function useClubProgress(clubId: string) {
  return useQuery({
    queryKey: ["club-progress", clubId],
    queryFn: async (): Promise<ClubProgress> => {
      const response = await fetch(`/api/clubs/${clubId}/progress`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch club progress");
      }
      return response.json();
    },
    enabled: false, // Отключено до реализации endpoint
  });
}

// ==== ПРИГЛАШЕНИЯ В КЛУБ ====

// Расширенное приглашение для отображения в UI

export type InviteToClubPayload =
  | string
  | {
      email?: string;
      userId?: string;
    };

// Пригласить пользователя в клуб (по email)
export function useInviteToClub(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: InviteToClubPayload): Promise<{ message: string }> => {
      const body = typeof payload === "string" ? { email: payload } : payload;
      return apiRequest(`/api/clubs/${clubId}/invite`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-invitations", clubId] });
    },
  });
}

// Получить список приглашений клуба (для владельца/модератора)
export function useClubInvitations(clubId: string) {
  return useQuery({
    queryKey: ["club-invitations", clubId],
    queryFn: async (): Promise<ClubInvitationWithInviter[]> => {
      const response = await apiRequest<{ invitations: ClubInvitationWithInviter[] }>(
        `/api/clubs/${clubId}/invitations`,
      );
      return response.invitations;
    },
  });
}

// Отозвать приглашение
export function useRevokeInvitation(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string): Promise<void> => {
      return apiRequest(`/api/clubs/${clubId}/invitations/${invitationId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-invitations", clubId] });
    },
  });
}

// Пересоздать приглашение
export function useResendInvitation(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string): Promise<Record<string, unknown>> => {
      return apiRequest(`/api/clubs/${clubId}/invitations/${invitationId}/resend`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-invitations", clubId] });
    },
  });
}

// Удалить все приглашения для указанного email (для принятых/отклоненных приглашений)
export function useRemoveInvitationsByEmail(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (email: string): Promise<{ deletedCount: number }> => {
      return apiRequest(`/api/clubs/${clubId}/invitations/by-email`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-invitations", clubId] });
    },
  });
}

// Очистить все приглашения клуба (только для владельца)
export function useClearAllInvitations(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ deletedCount: number }> => {
      return apiRequest(`/api/clubs/${clubId}/invitations`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-invitations", clubId] });
    },
  });
}

// Получить приглашение по токену (публичный endpoint)
export function useInvitationByToken(token: string) {
  return useQuery({
    queryKey: ["invitation-by-token", token],
    queryFn: async (): Promise<InvitationWithClub> => {
      const data = await apiRequest<{
        invitation: {
          id: string;
          email: string;
          status?: string;
          createdAt?: string;
          expiresAt?: string;
          acceptedAt?: string;
          inviterName?: string;
        };
        club?: {
          id: string;
          title: string;
          description?: string | null;
          isPrivate?: boolean;
          memberCount?: number;
          maxMembers?: number;
        } | null;
      }>(`/api/invitations/${token}`);

      // Приводим ответ к старой форме для совместимости с остальной частью UI
      const invitation = {
        id: data.invitation.id,
        email: data.invitation.email,
        status: data.invitation.status,
        createdAt: data.invitation.createdAt,
        expiresAt: data.invitation.expiresAt,
        acceptedAt: data.invitation.acceptedAt,
        inviterName: data.invitation.inviterName,
        clubName: data.club?.title,
        club: data.club,
        inviter: data.invitation.inviterName ? { username: data.invitation.inviterName } : null,
      } as InvitationWithClub;

      return invitation;
    },
    enabled: !!token,
  });
}

// Принять приглашение
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ token }: { token: string }): Promise<{ message: string; club?: { id?: string } | null }> => {
      return apiRequest(`/api/invitations/${token}/accept`, {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["clubs"] });
      if (data.club?.id) {
        queryClient.invalidateQueries({ queryKey: ["club", data.club.id] });
        queryClient.invalidateQueries({ queryKey: ["club-members", data.club.id] });
      }
    },
  });
}

// Отклонить приглашение
export function useDeclineInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ token }: { token: string }): Promise<{ message: string }> => {
      return apiRequest(`/api/invitations/${token}/decline`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clubs"] });
    },
  });
}
