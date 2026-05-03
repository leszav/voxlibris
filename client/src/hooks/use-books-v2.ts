import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Types based on new schema
export interface PersonalBook {
  id: string;
  userId: string;
  title: string;
  author: string;
  description?: string;
  publicationYear?: number;
  genre?: string;
  language?: string;
  format: "FB2" | "EPUB";
  fileHash?: string;
  fileSizeBytes?: number;
  coverUrl?: string;
  uploadedAt: string;
  createdAt?: string;
  updatedAt?: string;
  progress?: number;
  currentChapter?: number;
  primaryGenre?: BookGenreSummary | null;
  genres?: BookGenreSummary[];
}

export interface ClubBook {
  id: string;
  clubId: string;
  uploadedByUserId: string;
  title: string;
  author: string;
  description?: string;
  publicationYear?: number;
  genre?: string;
  language?: string;
  format: "FB2" | "EPUB";
  fileHash?: string;
  fileSizeBytes?: number;
  coverUrl?: string;
  recommendedReadingOrder?: number;
  uploadedAt: string;
  primaryGenre?: BookGenreSummary | null;
  genres?: BookGenreSummary[];
}

export interface BookGenreSummary {
  id: string;
  code: string;
  label: string;
  groupKey?: string | null;
  isPrimary?: boolean;
}

export interface DuplicateMatch {
  bookId: string;
  title: string;
  author: string;
  similarity: number;
  matchReason: string;
}

export interface UploadSessionResponse {
  sessionId: string;
  metadata: UploadMetadata;
  duplicates?: DuplicateMatch[];
}

export interface UploadMetadata {
  title: string;
  author: string;
  description?: string;
  language?: string;
  publicationYear?: number;
  genre?: string;
  genres?: string[];
  coverImageData?: string | null; // Base64
  coverImageType?: string | null;
  [key: string]: unknown;
}

export interface UpdatePersonalBookData {
  title?: string;
  author?: string;
  description?: string;
  publicationYear?: number;
  genre?: string;
  genres?: string[];
  language?: string;
}

// --- Personal Books Hooks ---
export function usePersonalBooks() {
  return useQuery<PersonalBook[]>({
    queryKey: ["/api/v1/user/books"],
  });
}

export function usePersonalBookUpload() {
  const queryClient = useQueryClient();

  // Step 1: Upload file and get metadata
  const uploadMutation = useMutation<UploadSessionResponse, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiRequest<UploadSessionResponse>("/api/v1/user/books/upload", {
        method: "POST",
        body: formData,
      });
      return res;
    },
  });

  // Step 2: Confirm upload with metadata
  const confirmMutation = useMutation<PersonalBook, Error, { sessionId: string; metadata: UploadMetadata }>({
    mutationFn: async ({ sessionId, metadata }) => {
      return apiRequest<PersonalBook>(`/api/v1/user/books/upload/${sessionId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ metadata }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/user/books"] });
    },
  });

  return {
    upload: uploadMutation,
    confirm: confirmMutation,
  };
}

export function useDeletePersonalBook() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (bookId: string) => {
      await apiRequest(`/api/v1/user/books/${bookId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/user/books"] });
    },
  });
}

export function useUpdatePersonalBook() {
  const queryClient = useQueryClient();

  return useMutation<PersonalBook, Error, { bookId: string; updates: UpdatePersonalBookData }>({
    mutationFn: async ({ bookId, updates }) => {
      return apiRequest<PersonalBook>(`/api/v1/user/books/${bookId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/user/books"] });
    },
  });
}

// --- Club Books Hooks ---

export function useClubBooks(clubId: string) {
  return useQuery<ClubBook[]>({
    queryKey: ["/api/v1/clubs", clubId, "books"],
    queryFn: () => apiRequest<ClubBook[]>(`/api/v1/clubs/${clubId}/books`),
    enabled: !!clubId,
  });
}

export function useClubBookUpload(clubId: string) {
  const queryClient = useQueryClient();

  // Step 1: Upload file and get metadata
  const uploadMutation = useMutation<UploadSessionResponse, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiRequest<UploadSessionResponse>(`/api/v1/clubs/${clubId}/books/upload`, {
        method: "POST",
        body: formData,
      });
      return res;
    },
  });

  // Step 2: Confirm upload with metadata
  const confirmMutation = useMutation<ClubBook, Error, { sessionId: string; metadata: UploadMetadata }>({
    mutationFn: async ({ sessionId, metadata }) => {
      return apiRequest<ClubBook>(`/api/v1/clubs/${clubId}/books/upload/${sessionId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ metadata }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/clubs", clubId, "books"] });
    },
  });

  return {
    upload: uploadMutation,
    confirm: confirmMutation,
  };
}

export function useDeleteClubBook(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (bookId: string) => {
      await apiRequest(`/api/v1/clubs/${clubId}/books/${bookId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/clubs", clubId, "books"] });
    },
  });
}

export interface UpdateClubBookData {
  title?: string;
  description?: string;
  coverUrl?: string;
  genre?: string;
  genres?: string[];
  language?: string;
  publicationYear?: number;
}

export function useGenresCatalog() {
  return useQuery<BookGenreSummary[]>({
    queryKey: ["/api/v1/genres/catalog"],
    queryFn: () => apiRequest<BookGenreSummary[]>("/api/v1/genres/catalog"),
  });
}

export function useUpdateClubBook(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation<ClubBook, Error, { bookId: string; data: UpdateClubBookData }>({
    mutationFn: async ({ bookId, data }) => {
      return apiRequest<ClubBook>(`/api/v1/clubs/${clubId}/books/${bookId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/clubs", clubId, "books"] });
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
    },
  });
}

export function useSetActiveBook(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (bookId: string) => {
      await apiRequest(`/api/v1/clubs/${clubId}/active-book`, {
        method: "PUT",
        body: JSON.stringify({ bookId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club", clubId] });
    },
  });
}
