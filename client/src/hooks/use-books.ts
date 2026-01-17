import { apiRequest } from "@/lib/queryClient";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";

// Legacy types for compatibility
export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  description?: string;
  isbn?: string;
  language?: string;
  publisher?: string;
  publishDate?: string;
  totalChapters: number;
  contentType: string;
  contentPath?: string;
  originalFilename?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookContent {
  id: string;
  bookId: string;
  chapterNumber: number;
  content: string;
  summary?: string;
  nextChapter?: number;
  prevChapter?: number;
}

// Chapter and content functions for reader studio
interface ChapterData {
  chapter: {
    id: string;
    bookId: string;
    chapterNumber: number;
    title: string;
    content: string;
  };
}

export function useBookChapter(bookId: string, chapterNumber: number) {
  return useQuery<ChapterData>({
    queryKey: ["book-chapter", bookId, chapterNumber],
    queryFn: async () => {
      return apiRequest<ChapterData>(`/api/v1/user/books/${bookId}/chapters/${chapterNumber}`);
    },
    enabled: !!bookId && chapterNumber > 0,
  });
}

export function useCreateBookContent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ bookId, data }: { bookId: string; data: { chapterNumber: number; title: string; content: string } }) => {
      return apiRequest(`/api/v1/user/books/${bookId}/chapters/${data.chapterNumber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-chapter"] });
    },
  });
}

export function useDeleteBookContent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ bookId, chapterNumber }: { bookId: string; chapterNumber: number }) => {
      return apiRequest(`/api/v1/user/books/${bookId}/chapters/${chapterNumber}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-chapter"] });
    },
  });
}