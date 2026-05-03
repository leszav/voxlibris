const PENDING_READER_BOOKMARK_KEY = "pendingReaderBookmarkNavigation";

export interface PendingReaderBookmarkNavigation {
  bookId: string;
  position: string;
}

export function savePendingReaderBookmarkNavigation(data: PendingReaderBookmarkNavigation): void {
  try {
    globalThis.sessionStorage?.setItem(PENDING_READER_BOOKMARK_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

export function consumePendingReaderBookmarkNavigation(bookId: string): PendingReaderBookmarkNavigation | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(PENDING_READER_BOOKMARK_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PendingReaderBookmarkNavigation>;
    if (parsed.bookId !== bookId || typeof parsed.position !== "string" || parsed.position.length === 0) {
      return null;
    }

    globalThis.sessionStorage?.removeItem(PENDING_READER_BOOKMARK_KEY);
    return {
      bookId,
      position: parsed.position,
    };
  } catch {
    return null;
  }
}
