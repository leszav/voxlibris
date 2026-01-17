import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";

// Получение контента клубной книги
export function useClubBookContent(
  clubId: string,
  clubBookId: string,
  chapter?: number,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["api/clubs", clubId, "books", clubBookId, "content", chapter],
    queryFn: async () => {
      const url = chapter
        ? `/api/clubs/${clubId}/books/${clubBookId}/content?chapter=${chapter}`
        : `/api/clubs/${clubId}/books/${clubBookId}/content`;

      const response = await apiRequest(url);

      return {
        title: (response as any).title,
        content: (response as any).content,
        chapters: (response as any).chapters,
        totalChapters: (response as any).totalChapters || 0,
        chapter: (response as any).chapter,
      };
    },
    enabled: !!clubId && !!clubBookId && enabled,
    staleTime: 1000 * 60 * 5, // 5 минут
  });
}

// Получение прогресса чтения клубной книги
export function useClubReadingProgress(clubId: string, clubBookId: string) {
  return useQuery({
    queryKey: ["club", clubId, "reading-progress", clubBookId],
    queryFn: async () => {
      const response = await apiRequest(`/api/clubs/${clubId}/progress`);

      if ((response as any).success === false) {
        throw new Error("Failed to get progress");
      }

      return {
        userProgress: (response as any).userProgress,
        clubProgress: (response as any).clubProgress,
      };
    },
    enabled: !!clubId && !!clubBookId,
  });
}

// Обновление прогресса чтения клубной книги
export function useUpdateClubProgress(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      currentChapter: number;
      currentPosition: string;
      progress: number;
    }) => {
      const response = await apiRequest(`/api/clubs/${clubId}/progress`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["club", clubId, "reading-progress"],
      });
      queryClient.invalidateQueries({
        queryKey: ["club", clubId, "reading-plan"],
      });
      queryClient.invalidateQueries({
        queryKey: ["club", clubId, "members-progress"],
      });
    },
  });
}

// Получение закладок клубной книги
export function useClubBookmarks(clubId: string) {
  const query = useQuery({
    queryKey: ["club", clubId, "bookmarks"],
    queryFn: async () => {
      const response = await apiRequest(`/api/clubs/${clubId}/bookmarks`);
      return (response as any).bookmarks;
    },
    enabled: !!clubId,
  });

  const bookmarks = useMemo(() => query.data || [], [query.data]);

  return {
    ...query,
    bookmarks,
  };
}

// Создание закладки в клубной книге
export function useCreateClubBookmark(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      position: number;
      chapter?: number;
      title: string;
      description?: string;
    }) => {
      const response = await apiRequest(`/api/clubs/${clubId}/bookmarks`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["club", clubId, "bookmarks"],
      });
    },
  });
}

// Удаление закладки в клубной книге
export function useDeleteClubBookmark(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      const response = await apiRequest(`/api/clubs/${clubId}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["club", clubId, "bookmarks"],
      });
    },
  });
}
