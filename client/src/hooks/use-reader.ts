import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiRequest } from "../lib/queryClient";
import type { Bookmark, Note } from "@shared/schema";

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

interface ReadingProgressResponse {
  progress: ReadingProgress;
}

interface BookmarksResponse {
  bookmarks: Bookmark[];
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
    queryKey: ["/api/progress", bookId],
    queryFn: async () => {
      try {
        const response = await apiRequest<ReadingProgressResponse>(`/api/progress/${bookId}`);
        // API возвращает { progress: {...} }, извлекаем внутренний объект
        return response.progress;
      } catch (error: unknown) {
        // Если прогресс не найден, возвращаем начальные значения
        const err = error as { status?: number };
        if (err?.status === 404) {
          return {
            currentChapter: 1,
            currentPosition: "",
            progress: 0
          };
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

  return useMutation({
    mutationFn: async (data: {
      currentChapter: number;
      currentPosition: string;
      progress: number;
      clubId?: string;
    }) => {
      const response = await apiRequest(`/api/progress`, {
        method: "PUT",
        body: JSON.stringify({
          ...data,
          bookId
        }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/progress", bookId],
      });
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
