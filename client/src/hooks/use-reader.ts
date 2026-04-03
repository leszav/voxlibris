import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiRequest } from "../lib/queryClient";
import type { Bookmark, Note } from "@shared/schema";
import {
  normalizeReaderSettings,
  type ReaderSettings,
} from "@/lib/reader-settings";
import {
  getFreshestReaderProgress,
  loadReaderProgressFromStorage,
  saveReaderProgressToStorage,
} from "@/lib/reader-local-progress";

interface BookContentResponse {
  title?: string;
  content?: string;
  chapters?: { chapterNumber: number; title?: string; content?: string }[];
  book?: {
    title: string;
    chapters?: { chapterNumber: number; title?: string; content?: string }[];
  };
}

interface ReadingProgress {
  currentChapter: number;
  currentPosition: string;
  progress: number;
}

interface UpdateProgressPayload {
  currentChapter: number;
  currentPosition: string;
  progress: number;
  clubId?: string;
}

interface UpdateProgressContext {
  previousProgress?: ReadingProgress;
}

interface ReaderSettingsResponse {
  settings: ReaderSettings;
}

interface UpdateReaderSettingsContext {
  previousSettings?: ReaderSettings;
}

export interface UserBookmarkListItem extends Bookmark {
  bookTitle: string | null;
  bookAuthor: string | null;
  bookCoverUrl: string | null;
}

interface BookmarksResponse {
  bookmarks: Bookmark[];
}

interface UserBookmarksResponse {
  bookmarks: UserBookmarkListItem[];
}

interface BookmarkResponse {
  bookmark: Bookmark;
}

interface NotesResponse {
  notes: Note[];
}

interface NoteResponse {
  note: Note;
}

// Получение контента книги
export function useBookContent(bookId: string, chapter?: number, enabled: boolean = true) {
  return useQuery({
    queryKey: ["/api/v1/books", bookId, "content", chapter],
    queryFn: async () => {
      // Сначала пробуем загрузить как личную книгу (Personal Books)
      try {
        const userBooksUrl = `/api/v1/user/books/${bookId}/content`;
        const response = await apiRequest<BookContentResponse>(userBooksUrl);
        return response;
      } catch (userBooksError: unknown) {
        const userBooksErr = userBooksError as { status?: number; message?: string };
        // Если книга не найдена в личных (404), пробуем общую библиотеку
        if (userBooksErr?.status === 404 || userBooksErr?.message?.includes('не найдена')) {
          const url = chapter
            ? `/api/v1/books/${bookId}/content?chapter=${chapter}`
            : `/api/v1/books/${bookId}/content`;
          const response = await apiRequest<BookContentResponse>(url);
          return response;
        }
        // Если другая ошибка - пробрасываем дальше
        throw userBooksError;
      }
    },
    enabled: !!bookId && enabled,
    staleTime: 1000 * 60 * 5, // 5 минут - контент редко меняется
  });
}

// Получение прогресса чтения
export function useReadingProgress(bookId: string) {
  return useQuery({
    queryKey: ["/api/v1/books", bookId, "progress"],
    queryFn: async () => {
      const localProgress = loadReaderProgressFromStorage({
        type: "personal",
        bookId,
      });

      try {
        const response = await apiRequest<ReadingProgress>(`/api/v1/books/${bookId}/progress`);
        return getFreshestReaderProgress(response, localProgress) ?? response;
      } catch (error: unknown) {
        // Если прогресс не найден, возвращаем начальные значения
        const err = error as { status?: number };
        if (err?.status === 404) {
          const defaultProgress = {
            currentChapter: 1,
            currentPosition: "",
            progress: 0
          };

          return getFreshestReaderProgress(defaultProgress, localProgress) ?? defaultProgress;
        }
        throw error;
      }
    },
    enabled: !!bookId,
  });
}

// Обновление прогресса чтения
export function useUpdateProgress(bookId: string) {
  const queryClient = useQueryClient();
  const progressQueryKey = ["/api/v1/books", bookId, "progress"] as const;

  return useMutation({
    mutationFn: async (data: UpdateProgressPayload) => {
      const response = await apiRequest(`/api/v1/books/${bookId}/progress`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      return response;
    },
    onMutate: async (data): Promise<UpdateProgressContext> => {
      await queryClient.cancelQueries({ queryKey: progressQueryKey });
      const previousProgress = queryClient.getQueryData<ReadingProgress>(progressQueryKey);

      saveReaderProgressToStorage(
        {
          type: "personal",
          bookId,
        },
        data,
      );

      queryClient.setQueryData<ReadingProgress>(progressQueryKey, (current) => ({
        ...current,
        currentChapter: data.currentChapter,
        currentPosition: data.currentPosition,
        progress: data.progress,
      }));

      return { previousProgress };
    },
    onError: (_error, _data, context) => {
      if (context?.previousProgress) {
        queryClient.setQueryData(progressQueryKey, context.previousProgress);
      }
    },
    onSuccess: (_response, data) => {
      saveReaderProgressToStorage(
        {
          type: "personal",
          bookId,
        },
        data,
      );

      queryClient.setQueryData<ReadingProgress>(progressQueryKey, (current) => ({
        ...current,
        currentChapter: data.currentChapter,
        currentPosition: data.currentPosition,
        progress: data.progress,
      }));
      queryClient.invalidateQueries({ queryKey: ["reading-status"] });
      queryClient.invalidateQueries({ queryKey: ["reading-stats"] });
      queryClient.invalidateQueries({ queryKey: ["reading-goal"] });
    },
  });
}

export function useReaderSettings(enabled: boolean = true, deviceMode: "desktop" | "mobile" = "desktop") {
  return useQuery({
    queryKey: ["reader-settings", deviceMode],
    queryFn: async () => {
      const response = await apiRequest<ReaderSettingsResponse>(`/api/v1/books/reader-settings?deviceMode=${deviceMode}`);
      return normalizeReaderSettings(response.settings);
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - settings don't change often
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export function useAllBookmarks() {
  const query = useQuery({
    queryKey: ["reader-all-bookmarks"],
    queryFn: async () => {
      const response = await apiRequest<UserBookmarksResponse>("/api/v1/books/all-bookmarks");
      return response.bookmarks;
    },
  });

  return {
    ...query,
    bookmarks: query.data || [],
  };
}

/**
 * Legacy hook for backward compatibility
 * New code should use the offline-first sync manager directly
 * This hook is kept for components that still use the old pattern
 */
export function useUpdateReaderSettings() {
  const queryClient = useQueryClient();
  const queryKey = ["reader-settings"] as const;

  return useMutation({
    mutationFn: async (settings: ReaderSettings) => {
      const response = await apiRequest<ReaderSettingsResponse>("/api/v1/books/reader-settings", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      });

      return normalizeReaderSettings(response.settings);
    },
    onMutate: async (settings): Promise<UpdateReaderSettingsContext> => {
      // Don't cancel queries - let them continue in background
      const previousSettings = queryClient.getQueryData<ReaderSettings>(queryKey);
      // Optimistically update cache immediately
      queryClient.setQueryData(queryKey, normalizeReaderSettings(settings));
      return { previousSettings };
    },
    onError: (_error, _settings, context) => {
      // Only rollback if we have previous settings
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKey, context.previousSettings);
      }
    },
    onSuccess: (settings) => {
      // Update cache with server response
      queryClient.setQueryData(queryKey, settings);
    },
  });
}

// Получение закладок
export function useBookmarks(bookId: string) {
  const query = useQuery({
    queryKey: ["/api/v1/books", bookId, "bookmarks"],
    queryFn: async () => {
      const response = await apiRequest<BookmarksResponse>(`/api/v1/books/${bookId}/bookmarks`);
      return response.bookmarks;
    },
    enabled: !!bookId,
  });

  // Мемоизация для избежания ререндеров
  const bookmarks = useMemo(() => query.data || [], [query.data]);

  return {
    ...query,
    bookmarks,
  };
}

// Добавление закладки
export function useAddBookmark(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      chapterNumber?: number;
      position: string;
      title?: string;
    }) => {
      const response = await apiRequest<BookmarkResponse>(`/api/v1/books/${bookId}/bookmarks`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return response.bookmark;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/books", bookId, "bookmarks"],
      });
      queryClient.invalidateQueries({
        queryKey: ["reader-all-bookmarks"],
      });
    },
  });
}

// Удаление закладки
export function useDeleteBookmark(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      await apiRequest(`/api/v1/books/${bookId}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/books", bookId, "bookmarks"],
      });
      queryClient.invalidateQueries({
        queryKey: ["reader-all-bookmarks"],
      });
    },
  });
}

export function useDeleteBookmarkEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookId, bookmarkId }: { bookId: string; bookmarkId: string }) => {
      await apiRequest(`/api/v1/books/${bookId}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/books", variables.bookId, "bookmarks"],
      });
      queryClient.invalidateQueries({
        queryKey: ["reader-all-bookmarks"],
      });
    },
  });
}

// Получение заметок
export function useNotes(bookId: string) {
  const query = useQuery({
    queryKey: ["/api/v1/books", bookId, "notes"],
    queryFn: async () => {
      const response = await apiRequest<NotesResponse>(`/api/v1/books/${bookId}/notes`);
      return response.notes;
    },
    enabled: !!bookId,
  });

  // Мемоизация для избежания ререндеров
  const notes = useMemo(() => query.data || [], [query.data]);

  return {
    ...query,
    notes,
  };
}

// Добавление заметки
export function useAddNote(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      chapterNumber?: number;
      position: string;
      highlightedText?: string;
      noteText: string;
      color?: string;
    }) => {
      const response = await apiRequest<NoteResponse>(`/api/v1/books/${bookId}/notes`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return response.note;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/books", bookId, "notes"],
      });
    },
  });
}

// Обновление заметки
export function useUpdateNote(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      noteText,
      color,
    }: {
      noteId: string;
      noteText: string;
      color?: string;
    }) => {
      const response = await apiRequest<NoteResponse>(
        `/api/v1/books/${bookId}/notes/${noteId}`,
        {
          method: "PUT",
          body: JSON.stringify({ noteText, color }),
        }
      );
      return response.note;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/books", bookId, "notes"],
      });
    },
  });
}

// Удаление заметки
export function useDeleteNote(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      await apiRequest(`/api/v1/books/${bookId}/notes/${noteId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/books", bookId, "notes"],
      });
    },
  });
}
