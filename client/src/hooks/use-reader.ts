import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiRequest } from "../lib/queryClient";
import type { Bookmark, Note } from "@shared/schema";

// Получение контента книги
export function useBookContent(bookId: string, chapter?: number, enabled: boolean = true) {
  return useQuery({
    queryKey: ["/api/v1/books", bookId, "content", chapter],
    queryFn: async () => {
      // Сначала пробуем загрузить как личную книгу (Personal Books)
      try {
        const userBooksUrl = `/api/v1/user/books/${bookId}/content`;
        const response = await apiRequest(userBooksUrl);
        return response as { book: { title: string; chapters: Array<{ title: string; content: string; chapterNumber: number }> } };
      } catch (userBooksError: any) {
        // Если книга не найдена в личных (404), пробуем общую библиотеку
        if (userBooksError?.status === 404 || userBooksError?.message?.includes('не найдена')) {
          const url = chapter 
            ? `/api/v1/books/${bookId}/content?chapter=${chapter}`
            : `/api/v1/books/${bookId}/content`;
          const response = await apiRequest(url) as { title: string; content: string; chapter?: number };
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
        const response = await apiRequest(`/api/progress/${bookId}`) as { progress: {
          currentChapter: number;
          currentPosition: string;
          progress: number;
        }};
        // API возвращает { progress: {...} }, извлекаем внутренний объект
        return response.progress;
      } catch (error: any) {
        // Если прогресс не найден, возвращаем начальные значения
        if (error?.status === 404) {
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
      const response = await apiRequest(`/api/v1/books/${bookId}/bookmarks`) as { bookmarks: Bookmark[] };
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
      const response = await apiRequest(`/api/v1/books/${bookId}/bookmarks`, {
        method: "POST",
        body: JSON.stringify(data),
      }) as { bookmark: Bookmark };
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
      const response = await apiRequest(`/api/v1/books/${bookId}/notes`) as { notes: Note[] };
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
      const response = await apiRequest(`/api/v1/books/${bookId}/notes`, {
        method: "POST",
        body: JSON.stringify(data),
      }) as { note: Note };
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
      const response = await apiRequest(
        `/api/v1/books/${bookId}/notes/${noteId}`,
        {
          method: "PUT",
          body: JSON.stringify({ noteText, color }),
        }
      ) as { note: Note };
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
