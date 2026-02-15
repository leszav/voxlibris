import { useCallback, useMemo } from "react";
import { useBookContent, useReadingProgress, useUpdateProgress } from "@/hooks/use-reader";
import {
  useClubBookContent,
  useClubReadingProgress,
  useUpdateClubProgress,
} from "@/hooks/use-club-reader";
import type { ReaderProgressPayload } from "./reader-progress-core";

interface MutationCallbacks {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

interface ReaderChapter {
  chapterNumber: number;
  title?: string;
  content?: string;
}

export interface ReaderBookData {
  title: string;
  chapters?: ReaderChapter[];
  content?: string;
  totalChapters: number;
  isPersonalBook: boolean;
}

interface PersonalBookContentResponse {
  book?: {
    title: string;
    chapters?: ReaderChapter[];
  };
  title?: string;
  content?: string;
}

interface ClubBookContentResponse {
  title: string;
  content?: string;
  chapters?: ReaderChapter[];
  totalChapters?: number;
  chapter?: number;
}

export function usePersonalReaderAdapter({
  bookId,
  currentChapter,
  clubId,
}: {
  bookId?: string;
  currentChapter: number | null;
  clubId?: string;
}) {
  const safeBookId = bookId || "";
  const { data: progress, isLoading: progressLoading } = useReadingProgress(safeBookId);
  const { data: content, isLoading: contentLoading } = useBookContent(
    safeBookId,
    currentChapter || 1,
    !!bookId && currentChapter !== null
  );
  const { mutate: updateProgress } = useUpdateProgress(safeBookId);

  const saveProgress = useCallback((payload: ReaderProgressPayload, callbacks?: MutationCallbacks) => {
    if (!bookId) return;
    updateProgress(
      {
        ...payload,
        clubId,
      },
      callbacks as never
    );
  }, [bookId, updateProgress, clubId]);

  const bookData = useMemo<ReaderBookData>(() => {
    const parsed = content as PersonalBookContentResponse | undefined;
    if (parsed?.book) {
      return {
        title: parsed.book.title,
        chapters: parsed.book.chapters,
        totalChapters: parsed.book.chapters?.length || 1,
        isPersonalBook: true,
      };
    }

    return {
      title: parsed?.title || "Загрузка...",
      content: parsed?.content || "",
      totalChapters: 1,
      isPersonalBook: false,
    };
  }, [content]);

  const currentChapterContent = useMemo(() => {
    if (bookData.isPersonalBook && bookData.chapters) {
      return bookData.chapters.find((ch) => ch.chapterNumber === currentChapter)?.content || "";
    }
    return bookData.content || "";
  }, [bookData, currentChapter]);

  return {
    progress: progress ?? null,
    progressLoading,
    contentLoading,
    bookData,
    currentChapterContent,
    saveProgress,
  };
}

export function useClubReaderAdapter({
  clubId,
  bookId,
  currentChapter,
}: {
  clubId: string;
  bookId: string;
  currentChapter: number | null;
}) {
  const progressQuery = useClubReadingProgress(clubId, bookId);
  const outlineContentQuery = useClubBookContent(clubId, bookId);
  const chapterContentQuery = useClubBookContent(
    clubId,
    bookId,
    currentChapter ?? undefined,
    currentChapter != null
  );
  const { mutate: updateProgress } = useUpdateClubProgress(clubId);

  const saveProgress = useCallback((payload: ReaderProgressPayload, callbacks?: MutationCallbacks) => {
    updateProgress(payload, callbacks as never);
  }, [updateProgress]);

  const outlineContent = outlineContentQuery.data as ClubBookContentResponse | undefined;
  const chapterContent = chapterContentQuery.data as ClubBookContentResponse | undefined;

  const bookData = useMemo<ReaderBookData>(() => {
    if (outlineContent?.chapters) {
      return {
        title: outlineContent.title,
        chapters: outlineContent.chapters,
        totalChapters: outlineContent.totalChapters || outlineContent.chapters.length,
        isPersonalBook: false,
      };
    }

    if (chapterContent?.chapters) {
      return {
        title: chapterContent.title,
        chapters: chapterContent.chapters,
        totalChapters: chapterContent.totalChapters || chapterContent.chapters.length,
        isPersonalBook: false,
      };
    }

    if (chapterContent) {
      return {
        title: chapterContent.title,
        content: chapterContent.content,
        totalChapters: chapterContent.totalChapters || 1,
        chapters: [],
        isPersonalBook: false,
      };
    }

    return {
      title: "Загрузка...",
      content: "",
      totalChapters: 1,
      chapters: [],
      isPersonalBook: false,
    };
  }, [outlineContent, chapterContent]);

  const chapters = useMemo(() => bookData.chapters || [], [bookData]);

  const currentChapterContent = useMemo(() => {
    if (chapterContent?.content && currentChapter != null) {
      return chapterContent.content;
    }
    return bookData.content || "";
  }, [chapterContent, currentChapter, bookData.content]);

  return {
    progressLoading: progressQuery.isLoading,
    userProgress: progressQuery.data?.userProgress ?? null,
    clubProgress: progressQuery.data?.clubProgress ?? null,
    outlineContent,
    chapterContent,
    contentLoading: chapterContentQuery.isLoading,
    bookData,
    chapters,
    currentChapterContent,
    saveProgress,
  };
}
