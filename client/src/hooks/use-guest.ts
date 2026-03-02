import { useState, useMemo, useCallback, useEffect } from "react";

const API_BASE = "/api/v1/guest";
const FINGERPRINT_KEY = "guest_fingerprint";

// ============================================
// Types
// ============================================

export interface GuestAccountResponse {
  guestId: string;
  accessCode: string;
  expiresAt: string;
  hasBook: boolean;
  canRecover?: boolean;
}

export interface GuestBookResponse {
  bookId: string;
  title: string;
  author: string;
  description?: string;
  format: "epub" | "fb2";
  wordCount: number;
  flatContent: string;
  uploadedAt: string;
  expiresAt: string;
  moderationStatus: "pending" | "approved" | "rejected";
}

export interface GuestReadingPositionResponse {
  progressPercent: number;
  currentPosition: Record<string, unknown>;
  readingTimeMinutes: number;
  lastReadAt: string | null;
}

export interface GuestAnalyticsSummaryResponse {
  totalReadingTime: number;
  sessionsCount: number;
  averageSessionTime: number;
  lastActivity: string | null;
}

interface UseGuestState {
  isLoading: boolean;
  error: string | null;
  guest: GuestAccountResponse | null;
  book: GuestBookResponse | null;
  position: GuestReadingPositionResponse | null;
  analytics: GuestAnalyticsSummaryResponse | null;
}

interface ApiError extends Error {
  status?: number;
  code?: string;
}

// ============================================
// API Functions
// ============================================

async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
  });
  
  if (!response.ok) {
    const payload = await response.json().catch(() => ({} as Record<string, unknown>));
    const message =
      (typeof payload.message === "string" && payload.message) ||
      (typeof payload.error === "string" && payload.error) ||
      `Request failed (${response.status})`;

    const error = new Error(message) as ApiError;
    error.status = response.status;
    if (typeof payload.code === "string") {
      error.code = payload.code;
    }
    throw error;
  }
  
  return response.json();
}

export async function initGuest(): Promise<GuestAccountResponse> {
  return apiCall<GuestAccountResponse>(`${API_BASE}/init`, { method: "POST" });
}

export async function restoreGuest(code: string): Promise<GuestAccountResponse> {
  return apiCall<GuestAccountResponse>(`${API_BASE}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

export async function logoutGuest(): Promise<void> {
  await fetch(`${API_BASE}/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function getCurrentGuest(): Promise<GuestAccountResponse | null> {
  try {
    return await apiCall<GuestAccountResponse>(`${API_BASE}/me`);
  } catch (e) {
    const apiError = e as ApiError;
    if (apiError?.status === 404 || apiError?.status === 401) {
      return null;
    }
    throw e;
  }
}

export async function getGuestBook(): Promise<GuestBookResponse | null> {
  try {
    return await apiCall<GuestBookResponse>(`${API_BASE}/books/current`);
  } catch (e) {
    const apiError = e as ApiError;
    if (apiError?.status === 404 || apiError?.status === 410) {
      return null;
    }
    throw e;
  }
}

export async function saveGuestPosition(
  progressPercent: number,
  currentPosition?: Record<string, unknown>,
  readingTimeMinutes?: number
): Promise<GuestReadingPositionResponse> {
  return apiCall<GuestReadingPositionResponse>(`${API_BASE}/books/current/position`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ progressPercent, currentPosition, readingTimeMinutes }),
  });
}

export async function getGuestPosition(): Promise<GuestReadingPositionResponse | null> {
  try {
    return await apiCall<GuestReadingPositionResponse>(`${API_BASE}/books/current/position`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) {
      return null;
    }
    throw e;
  }
}

export async function trackGuestEvent(
  eventType: "session_start" | "session_end" | "book_open",
  sessionId?: string,
  eventData?: Record<string, unknown>
): Promise<void> {
  try {
    await apiCall(`${API_BASE}/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, sessionId, eventData }),
    });
  } catch (e) {
    // Non-critical
    console.warn("Failed to track event:", e);
  }
}

export async function getGuestAnalyticsSummary(): Promise<GuestAnalyticsSummaryResponse> {
  return apiCall<GuestAnalyticsSummaryResponse>(`${API_BASE}/analytics/summary`);
}

// Загрузить книгу
export async function uploadGuestBook(
  file: File,
  onProgress?: (progress: number) => void
): Promise<GuestBookResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress((e.loaded / e.total) * 100);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        const error = JSON.parse(xhr.responseText);
        reject(new Error(error.message || "Failed to upload book"));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Failed to upload book"));
    });

    const formData = new FormData();
    formData.append("file", file);

    xhr.open("POST", `${API_BASE}/books/upload`);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

// Удалить книгу
export async function deleteGuestBook(): Promise<void> {
  const response = await fetch(`${API_BASE}/books/current`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete book");
  }
}

// ============================================
// React Hook
// ============================================

function getOrCreateFingerprint(): string {
  let fingerprint = localStorage.getItem(FINGERPRINT_KEY);
  if (!fingerprint) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    fingerprint = result;
    localStorage.setItem(FINGERPRINT_KEY, fingerprint);
  }
  return fingerprint;
}

export function useGuest(options?: { autoInit?: boolean }) {
  const autoInit = options?.autoInit ?? true;
  const [state, setState] = useState<UseGuestState>({
    isLoading: true,
    error: null,
    guest: null,
    book: null,
    position: null,
    analytics: null,
  });

  const init = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const guest = await initGuest();
      let book: GuestBookResponse | null = null;
      
      if (guest.hasBook) {
        try {
          book = await getGuestBook();
        } catch (bookError) {
          console.warn("Failed to load guest book after init:", bookError);
        }
      }
      
      setState({
        isLoading: false,
        error: null,
        guest,
        book,
        position: null,
        analytics: null,
      });

      return { guest, book };
    } catch (e) {
      const normalizedError = e instanceof Error ? e : new Error("Failed to initialize");
      setState(s => ({
        ...s,
        isLoading: false,
        error: normalizedError.message,
      }));
      throw normalizedError;
    }
  }, []);

  const loadCurrentGuest = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const guest = await getCurrentGuest();
      let book: GuestBookResponse | null = null;

      if (guest?.hasBook) {
        try {
          book = await getGuestBook();
        } catch (bookError) {
          console.warn("Failed to load current guest book:", bookError);
        }
      }

      setState(s => ({
        ...s,
        isLoading: false,
        error: null,
        guest,
        book,
      }));
    } catch (e) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: e instanceof Error ? e.message : "Failed to load guest",
      }));
    }
  }, []);

  // Initialize fingerprint and guest state
  useEffect(() => {
    getOrCreateFingerprint();

    if (!autoInit) {
      setState(s => ({ ...s, isLoading: false }));
      return;
    }

    void loadCurrentGuest();
  }, [autoInit, loadCurrentGuest]);

  const restore = useCallback(async (code: string) => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const guest = await restoreGuest(code);
      let book: GuestBookResponse | null = null;
      
      if (guest.hasBook) {
        try {
          book = await getGuestBook();
        } catch (bookError) {
          console.warn("Failed to load guest book after restore:", bookError);
        }
      }
      
      setState({
        isLoading: false,
        error: null,
        guest,
        book,
        position: null,
        analytics: null,
      });

      return { guest, book };
    } catch (e) {
      const normalizedError = e instanceof Error ? e : new Error("Failed to restore");
      setState(s => ({
        ...s,
        isLoading: false,
        error: normalizedError.message,
      }));
      throw normalizedError;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutGuest();
      setState({
        isLoading: false,
        error: null,
        guest: null,
        book: null,
        position: null,
        analytics: null,
      });
    } catch (e) {
      console.error("Failed to logout:", e);
    }
  }, []);

  const refreshBook = useCallback(async () => {
    if (!state.guest) return;
    try {
      const book = await getGuestBook();
      setState(s => ({ ...s, book }));
    } catch (e) {
      console.error("Failed to refresh book:", e);
    }
  }, [state.guest]);

  const uploadBook = useCallback(async (
    file: File,
    onProgress?: (progress: number) => void
  ) => {
    try {
      const book = await uploadGuestBook(file, onProgress);
      setState(s => ({ ...s, book }));
      return book;
    } catch (e) {
      console.error("Failed to upload book:", e);
      throw e;
    }
  }, []);

  const deleteBook = useCallback(async () => {
    try {
      await deleteGuestBook();
      setState(s => ({ ...s, book: null, position: null }));
    } catch (e) {
      console.error("Failed to delete book:", e);
      throw e;
    }
  }, []);

  const refreshPosition = useCallback(async () => {
    if (!state.book) return;
    try {
      const position = await getGuestPosition();
      setState(s => ({ ...s, position }));
    } catch (e) {
      console.error("Failed to refresh position:", e);
    }
  }, [state.book]);

  const savePosition = useCallback(async (
    progress: number,
    currentPosition?: Record<string, unknown>
  ) => {
    try {
      const position = await saveGuestPosition(progress, currentPosition);
      setState(s => ({ ...s, position }));
    } catch (e) {
      console.error("Failed to save position:", e);
    }
  }, []);

  const refreshAnalytics = useCallback(async () => {
    if (!state.guest) return;
    try {
      const analytics = await getGuestAnalyticsSummary();
      setState(s => ({ ...s, analytics }));
    } catch (e) {
      console.error("Failed to refresh analytics:", e);
    }
  }, [state.guest]);

  const trackEvent = useCallback(async (
    eventType: "session_start" | "session_end" | "book_open",
    sessionId?: string,
    eventData?: Record<string, unknown>
  ) => {
    await trackGuestEvent(eventType, sessionId, eventData);
  }, []);

  // Computed values
  const isGuest = useMemo(() => !!state.guest, [state.guest]);
  const hasBook = useMemo(() => !!state.book, [state.book]);
  
  const isBookExpired = useMemo(() => {
    if (!state.book) return false;
    return new Date(state.book.expiresAt) < new Date();
  }, [state.book]);
  
  const expiresInDays = useMemo(() => {
    if (!state.guest) return 0;
    const expires = new Date(state.guest.expiresAt);
    const now = new Date();
    const diff = expires.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [state.guest]);

  return {
    // State
    isLoading: state.isLoading,
    error: state.error,
    guest: state.guest,
    book: state.book,
    position: state.position,
    analytics: state.analytics,
    
    // Computed
    isGuest,
    hasBook,
    isBookExpired,
    expiresInDays,
    
    // Methods
    init,
    restore,
    logout,
    refreshBook,
    uploadBook,
    deleteBook,
    refreshPosition,
    savePosition,
    refreshAnalytics,
    trackEvent,
  };
}
