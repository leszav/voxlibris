import { useState, useEffect, useRef, useCallback, useMemo, type ComponentProps, type RefObject } from "react";
import { useLocation, useParams } from "wouter";
import { useAnalytics } from "../../hooks/use-analytics";
import { getMobileAnalyticsContext } from "@/lib/mobile-analytics";
import { useAddBookmark, useBookmarks, useDeleteBookmark } from "../../hooks/use-reader";
import { ContentRenderer } from "./ContentRenderer";
import { BookmarksPanel } from "./BookmarksPanel";
import { useKeyboardShortcuts, readerShortcuts } from "./useKeyboardShortcuts";
import { LatestPositionPrompt } from "./LatestPositionPrompt";
import { ReaderControls } from "./ReaderControls";
import { SelectionBookmarkPrompt } from "./SelectionBookmarkPrompt";
import { Button } from "../ui/button";
import { Maximize2, Minimize2, List, Settings, ArrowLeft, Bookmark } from "lucide-react";
import { getAccessToken } from "@/lib/token-store";
import {
  createReaderProgressPayload,
  parseReaderPosition,
} from "./core/reader-progress-core";
import {
  restoreReaderScrollPosition,
  useDebouncedReaderProgressSave,
  useRestoreReaderScroll,
} from "./core/use-reader-progress-sync";
import { useReaderLatestProgress } from "./core/use-reader-latest-progress";
import { useReaderPanelsAutoclose } from "./core/use-reader-panels-autoclose";
import { useReaderSelectionBookmark } from "./core/use-reader-selection-bookmark";
import { useSmoothReaderSpaceScroll } from "./core/use-smooth-reader-space-scroll";
import { usePreserveReaderVisualAnchor } from "./core/use-preserve-reader-visual-anchor";
import { usePersonalReaderAdapter } from "./core/use-reader-data-adapters";
import { useSyncedReaderSettings } from "./core/use-synced-reader-settings";
import { useReaderSyncState } from "./core/use-reader-sync-state";
import { ReaderProgressIndicators } from "./ReaderProgressIndicators";
import { consumePendingReaderBookmarkNavigation } from "@/lib/reader-bookmark-navigation";
import { saveReaderProgressToStorage } from "@/lib/reader-local-progress";
import { toast } from "@/hooks/use-toast";
import { applyReaderSettings, type ReaderSettings } from "@/lib/reader-settings";

interface Chapter {
  chapterNumber: number;
  title?: string;
  content?: string;
}

interface ProcessedBookData {
  title: string;
  chapters?: Chapter[];
  content?: string;
  totalChapters: number;
  isPersonalBook: boolean;
}

interface ReaderWorkspaceProps {
  bookId?: string;
  clubId?: string;
  params?: {
    bookId?: string;
  };
}

interface PendingScrollRestore {
  chapter: number;
  positionRaw: string;
}

function getInitialChapter(
  progress: { currentChapter: number } | null | undefined,
  progressLoading: boolean
): number | null {
  if (progressLoading) return null;
  return progress?.currentChapter || 1;
}

function createBookmarkTitleFromSelection(selectedText: string): string {
  const normalized = selectedText.trim().replaceAll(/\s+/g, " ");
  if (!normalized) {
    return "Без названия";
  }

  const words = normalized.split(" ").filter(Boolean);
  const snippetByWords = words.slice(0, 12).join(" ");
  const baseSnippet = snippetByWords || normalized;
  const boundedSnippet = baseSnippet.length > 72
    ? `${baseSnippet.slice(0, 69).trimEnd()}...`
    : baseSnippet;

  return boundedSnippet;
}

function ReaderMainContent({
  contentLoading,
  currentChapterContent,
  currentChapter,
  bookData,
  setCurrentChapter,
  onMarkAsRead
}: Readonly<{
  contentLoading: boolean;
  currentChapterContent: string;
  currentChapter: number | null;
  bookData: ProcessedBookData;
  setCurrentChapter: (chapter: number) => void;
  onMarkAsRead: () => void;
}>) {
  if (contentLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }
  if (currentChapterContent) {
    const chapter = currentChapter ?? 1;
    return (
      <>
        <ContentRenderer content={currentChapterContent} />
        <div className="flex flex-wrap justify-between items-center gap-2 mt-12 pt-8 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentChapter(Math.max(1, chapter - 1))}
            disabled={chapter <= 1}
            className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm"
          >
            ← Пред.
          </Button>
          <span className="text-xs sm:text-sm text-muted-foreground order-first sm:order-none w-full sm:w-auto text-center sm:text-left">
            Глава {chapter} из {bookData.totalChapters}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentChapter(Math.min(bookData.totalChapters, chapter + 1))}
            disabled={chapter >= bookData.totalChapters}
            className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm"
          >
            След. →
          </Button>
        </div>
        {chapter === bookData.totalChapters && (
          <div className="mt-6 flex justify-end">
            <Button variant="default" onClick={onMarkAsRead}>
              Отметить как прочитанное
            </Button>
          </div>
        )}
      </>
    );
  }
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-muted-foreground">Контент не найден</p>
    </div>
  );
}

function useTrackReaderAnalytics({
  bookId,
  currentChapter,
  contentLoading,
  progress,
  analytics
}: {
  bookId?: string;
  currentChapter: number | null;
  contentLoading: boolean;
  progress: { currentChapter: number } | null | undefined;
  analytics: ReturnType<typeof useAnalytics>;
}) {
  const trackedChapterRef = useRef<number | null>(null);
  const sessionActiveRef = useRef(false);

  useEffect(() => {
    if (!bookId || currentChapter === null || contentLoading) return;

    // Отслеживаем только смену главы, чтобы избежать повторных вызовов
    if (trackedChapterRef.current === currentChapter) return;
    
    trackedChapterRef.current = currentChapter;

    if (currentChapter === 1 || currentChapter === progress?.currentChapter) {
      analytics.trackBookOpen(bookId, getMobileAnalyticsContext({ source: "personal_reader" }) ?? undefined);
    }

    analytics.trackChapterStart(bookId, currentChapter);
    
    if (!sessionActiveRef.current) {
      analytics.startReadingSession(bookId, currentChapter);
      sessionActiveRef.current = true;
    }

    return () => {
      if (sessionActiveRef.current) {
        analytics.stopReadingSession();
        sessionActiveRef.current = false;
      }
    };
  }, [bookId, currentChapter, contentLoading, progress?.currentChapter]);
}

function usePersistProgressOnUnmount({
  scrollContainerRef,
  bookData,
  currentChapter,
  clubId,
  bookId
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  bookData: ProcessedBookData;
  currentChapter: number | null;
  clubId?: string;
  bookId?: string;
}) {
  useEffect(() => {
    return () => {
      const container = scrollContainerRef.current;
      if (!container || !bookData || bookData.totalChapters === 0 || currentChapter === null) return;

      const payload = createReaderProgressPayload({
        currentChapter,
        totalChapters: bookData.totalChapters,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });

      if (!bookId) {
        return;
      }

      saveReaderProgressToStorage(
        {
          type: "personal",
          bookId,
        },
        payload,
      );

      const token = getAccessToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token && token !== "null") {
        headers.Authorization = `Bearer ${token}`;
      }

      fetch(`/api/v1/books/${bookId}/progress`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          ...payload,
          clubId,
        }),
        credentials: "include",
        keepalive: true,
      });
    };
  }, [scrollContainerRef, bookData, currentChapter, clubId, bookId]);
}

function usePendingBookmarkNavigation({
  bookId,
  currentChapter,
  setPendingScrollRestore,
  setCurrentChapter,
}: {
  bookId?: string;
  currentChapter: number | null;
  setPendingScrollRestore: (restore: PendingScrollRestore | null) => void;
  setCurrentChapter: (chapter: number) => void;
}) {
  useEffect(() => {
    if (!bookId || currentChapter === null) {
      return;
    }

    const pendingBookmark = consumePendingReaderBookmarkNavigation(bookId);
    if (!pendingBookmark) {
      return;
    }

    const position = parseReaderPosition(pendingBookmark.position);
    if (!position?.chapter) {
      return;
    }

    setPendingScrollRestore({
      chapter: position.chapter,
      positionRaw: pendingBookmark.position,
    });
    setCurrentChapter(position.chapter);
  }, [bookId, currentChapter, setCurrentChapter, setPendingScrollRestore]);
}

function usePendingScrollRestore({
  pendingScrollRestore,
  contentLoading,
  currentChapter,
  scrollElementRef,
  contentAreaRef,
  manualRestoreCleanupRef,
  setPendingScrollRestore,
}: {
  pendingScrollRestore: PendingScrollRestore | null;
  contentLoading: boolean;
  currentChapter: number | null;
  scrollElementRef: RefObject<HTMLElement | null>;
  contentAreaRef: RefObject<HTMLElement | null>;
  manualRestoreCleanupRef: RefObject<(() => void) | null>;
  setPendingScrollRestore: (restore: PendingScrollRestore | null) => void;
}) {
  useEffect(() => {
    return () => {
      manualRestoreCleanupRef.current?.();
    };
  }, [manualRestoreCleanupRef]);

  useEffect(() => {
    if (!pendingScrollRestore || contentLoading || currentChapter !== pendingScrollRestore.chapter) {
      return;
    }

    manualRestoreCleanupRef.current?.();
    manualRestoreCleanupRef.current = restoreReaderScrollPosition({
      scrollContainerRef: scrollElementRef,
      contentAreaRef,
      currentChapter,
      currentPositionRaw: pendingScrollRestore.positionRaw,
      delayMs: 120,
      retryAttempts: 5,
      retryDelayMs: 120,
    });
    setPendingScrollRestore(null);
  }, [
    contentLoading,
    currentChapter,
    manualRestoreCleanupRef,
    pendingScrollRestore,
    scrollElementRef,
    setPendingScrollRestore,
  ]);
}

function useReaderChapterNavigation({
  currentChapter,
  chaptersLength,
  scrollContainerRef,
  saveProgressNow,
  setCurrentChapter,
}: {
  currentChapter: number | null;
  chaptersLength?: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  saveProgressNow: (options?: { chapter?: number; progressOverride?: number }) => void;
  setCurrentChapter: (chapter: number) => void;
}) {
  const persistCurrentChapterProgress = useCallback((chapterToSave: number) => {
    saveProgressNow({ chapter: chapterToSave });
  }, [saveProgressNow]);

  const changeChapter = useCallback((chapter: number) => {
    if (currentChapter === null) {
      setCurrentChapter(chapter);
      return;
    }

    if (chapter === currentChapter) {
      return;
    }

    persistCurrentChapterProgress(currentChapter);
    setCurrentChapter(chapter);

    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }, 100);
  }, [currentChapter, persistCurrentChapterProgress, scrollContainerRef, setCurrentChapter]);

  useKeyboardShortcuts([
    {
      key: readerShortcuts.prevChapter.key,
      action: () => {
        if (currentChapter !== null && currentChapter > 1) {
          changeChapter(currentChapter - 1);
        }
      },
      description: readerShortcuts.prevChapter.description,
      requireAtTop: true,
      scrollContainerRef,
    },
    {
      key: readerShortcuts.nextChapter.key,
      action: () => {
        if (currentChapter !== null && chaptersLength && currentChapter < chaptersLength) {
          changeChapter(currentChapter + 1);
        }
      },
      description: readerShortcuts.nextChapter.description,
      requireAtBottom: true,
      scrollContainerRef,
    },
  ]);

  return {
    changeChapter,
  };
}

function useReaderSavedPositionActions({
  scrollContainerRef,
  currentChapter,
  totalChapters,
  selectionState,
  clearSelection,
  addBookmark,
  suggestedProgress,
  dismissSuggestion,
  setPendingScrollRestore,
  setCurrentChapter,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  currentChapter: number | null;
  totalChapters: number;
  selectionState: { text: string } | null;
  clearSelection: () => void;
  addBookmark: (data: { chapterNumber?: number; position: string; title?: string }, options?: { onSuccess?: () => void }) => void;
  suggestedProgress: { currentChapter: number; currentPosition: string } | null;
  dismissSuggestion: () => void;
  setPendingScrollRestore: (restore: PendingScrollRestore | null) => void;
  setCurrentChapter: (chapter: number) => void;
}) {
  const createCurrentBookmarkDraft = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || currentChapter === null) {
      return null;
    }

    const payload = createReaderProgressPayload({
      currentChapter,
      totalChapters,
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    });

    return {
      chapterNumber: currentChapter,
      position: payload.currentPosition,
    };
  }, [currentChapter, scrollContainerRef, totalChapters]);

  const navigateToSavedPosition = useCallback((chapter: number, positionRaw: string) => {
    setPendingScrollRestore({
      chapter,
      positionRaw,
    });
    setCurrentChapter(chapter);
  }, [setCurrentChapter, setPendingScrollRestore]);

  const navigateToBookmark = useCallback((positionRaw: string) => {
    const position = parseReaderPosition(positionRaw);
    if (!position?.chapter) {
      return;
    }

    navigateToSavedPosition(position.chapter, positionRaw);
  }, [navigateToSavedPosition]);

  const addBookmarkFromSelection = useCallback(() => {
    if (!selectionState) {
      return;
    }

    const currentBookmarkDraft = createCurrentBookmarkDraft();
    if (!currentBookmarkDraft) {
      clearSelection();
      return;
    }

    const bookmarkTitle = createBookmarkTitleFromSelection(selectionState.text);

    addBookmark(
      {
        chapterNumber: currentBookmarkDraft.chapterNumber,
        position: currentBookmarkDraft.position,
        title: bookmarkTitle,
      },
      {
        onSuccess: () => {
          toast({
            title: "Закладка сохранена",
            description: "Выделенный фрагмент добавлен в закладки.",
          });
          clearSelection();
        },
      }
    );
  }, [addBookmark, clearSelection, createCurrentBookmarkDraft, selectionState]);

  const openLatestPosition = useCallback(() => {
    if (!suggestedProgress) {
      return;
    }

    dismissSuggestion();
    navigateToSavedPosition(suggestedProgress.currentChapter, suggestedProgress.currentPosition);
  }, [dismissSuggestion, navigateToSavedPosition, suggestedProgress]);

  return {
    createCurrentBookmarkDraft,
    navigateToBookmark,
    addBookmarkFromSelection,
    openLatestPosition,
  };
}

function ReaderWorkspaceView({
  onBackToLibrary,
  selectionState,
  addBookmarkFromSelection,
  clearSelection,
  suggestedProgress,
  currentChapter,
  openLatestPosition,
  dismissSuggestion,
  tocOpen,
  closeAllPanels,
  setTocOpen,
  changeChapter,
  bookData,
  bookmarksOpen,
  setBookmarksOpen,
  bookmarksLoading,
  bookId,
  bookmarks,
  isAddingBookmark,
  createCurrentBookmarkDraft,
  addBookmark,
  deleteBookmark,
  navigateToBookmark,
  settingsOpen,
  setSettingsOpen,
  settings,
  updateSettingsWithAnchor,
  previewSettings,
  resetSettingsWithAnchor,
  isFullscreen,
  toggleFullscreen,
  scrollContainerRef,
  scheduleProgressSave,
  contentAreaRef,
  tocPanelRef,
  bookmarksPanelRef,
  settingsPanelRef,
  mainContent,
  isSyncing,
  lastSyncTime,
  syncError,
  progress,
}: Readonly<{
  onBackToLibrary: () => void;
  selectionState: { text: string; top: number; left: number } | null;
  addBookmarkFromSelection: () => void;
  clearSelection: () => void;
  suggestedProgress: { currentChapter: number; currentPosition: string } | null;
  currentChapter: number;
  openLatestPosition: () => void;
  dismissSuggestion: () => void;
  tocOpen: boolean;
  closeAllPanels: () => void;
  setTocOpen: (open: boolean) => void;
  changeChapter: (chapter: number) => void;
  bookData: ProcessedBookData;
  bookmarksOpen: boolean;
  setBookmarksOpen: (open: boolean) => void;
  bookmarksLoading: boolean;
  bookId: string;
  bookmarks: ComponentProps<typeof BookmarksPanel>["bookmarks"];
  isAddingBookmark: boolean;
  createCurrentBookmarkDraft: () => { chapterNumber: number; position: string } | null;
  addBookmark: (data: { chapterNumber?: number; position: string; title?: string }) => void;
  deleteBookmark: (bookmarkId: string) => void;
  navigateToBookmark: (positionRaw: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  settings: ReaderSettings;
  updateSettingsWithAnchor: (nextSettings: ReaderSettings) => void;
  previewSettings: (nextSettings: ReaderSettings) => void;
  resetSettingsWithAnchor: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scheduleProgressSave: () => void;
  contentAreaRef: RefObject<HTMLDivElement | null>;
  tocPanelRef: RefObject<HTMLDivElement | null>;
  bookmarksPanelRef: RefObject<HTMLDivElement | null>;
  settingsPanelRef: RefObject<HTMLDivElement | null>;
  mainContent: React.ReactNode;
  isSyncing: boolean;
  lastSyncTime: number | null;
  syncError: string | null;
  progress: { currentChapter: number; currentPosition: string; progress: number } | null;
}>) {
  const tocActiveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (tocOpen) {
      tocActiveRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [tocOpen]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {selectionState && (
        <SelectionBookmarkPrompt
          text={selectionState.text}
          top={selectionState.top}
          left={selectionState.left}
          onConfirm={addBookmarkFromSelection}
          onDismiss={clearSelection}
        />
      )}
      {suggestedProgress && (
        <LatestPositionPrompt
          currentChapter={currentChapter}
          remoteChapter={suggestedProgress.currentChapter}
          onOpenLatest={openLatestPosition}
          onDismiss={dismissSuggestion}
        />
      )}

      <header className="border-b bg-background relative z-50">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 p-2 sm:p-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToLibrary}
              className="text-xs sm:text-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden xs:inline">Библиотека</span>
            </Button>

            <div className="relative">
              <Button
                variant={tocOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  const nextOpen = !tocOpen;
                  closeAllPanels();
                  setTocOpen(nextOpen);
                }}
                className="text-xs sm:text-sm"
              >
                <List className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Оглавление</span>
              </Button>
            </div>
            {tocOpen && (
              <div className="fixed inset-0 z-50 flex items-start justify-end pointer-events-none">
                <div ref={tocPanelRef} className="bg-background border rounded-lg shadow-xl w-[85vw] max-w-[320px] sm:max-w-md max-h-[80vh] overflow-y-auto pointer-events-auto mt-14 mr-2 sm:mr-4 flex flex-col">
                  <div className="sticky top-0 bg-background border-b p-3 sm:p-4 flex items-center justify-between flex-none">
                    <h3 className="font-semibold text-base sm:text-lg">Оглавление</h3>
                    <Button variant="ghost" size="sm" onClick={() => setTocOpen(false)}>✕</Button>
                  </div>
                  <div className="p-2 sm:p-3 flex-1 space-y-0.5">
                    {bookData.isPersonalBook && bookData.chapters ? (
                      bookData.chapters.map((chapter: Chapter) => {
                        const isActive = currentChapter === chapter.chapterNumber;
                        return (
                          <Button
                            key={chapter.chapterNumber}
                            ref={isActive ? tocActiveRef : undefined}
                            variant={isActive ? "secondary" : "ghost"}
                            className="w-full justify-start text-left h-auto py-2 px-3"
                            onClick={() => {
                              changeChapter(chapter.chapterNumber);
                              setTocOpen(false);
                            }}
                          >
                            <div className="flex flex-col items-start">
                              <span className="font-medium text-sm">{chapter.title || `Глава ${chapter.chapterNumber}`}</span>
                              {chapter.title && (
                                <span className="text-xs text-muted-foreground mt-0.5">Глава {chapter.chapterNumber}</span>
                              )}
                            </div>
                          </Button>
                        );
                      })
                    ) : (
                      <Button
                        ref={tocActiveRef}
                        variant={currentChapter === 1 ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => {
                          changeChapter(1);
                          setTocOpen(false);
                        }}
                      >
                        Глава 1
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="relative">
              <Button
                variant={bookmarksOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  const nextOpen = !bookmarksOpen;
                  closeAllPanels();
                  setBookmarksOpen(nextOpen);
                }}
                className="text-xs sm:text-sm"
              >
                <Bookmark className="w-4 h-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Закладки</span>
              </Button>
              {bookmarksOpen && (
                <div ref={bookmarksPanelRef} className="absolute left-0 top-full mt-2 w-[85vw] max-w-[360px] sm:w-96 max-h-96 overflow-y-auto bg-background text-foreground border rounded-md shadow-lg p-3 sm:p-4 z-50">
                  {bookmarksLoading ? (
                    <p className="text-sm text-muted-foreground">Загрузка закладок...</p>
                  ) : (
                    <BookmarksPanel
                      bookId={bookId}
                      bookmarks={bookmarks}
                      isCreatingBookmark={isAddingBookmark}
                      getCurrentBookmarkDraft={createCurrentBookmarkDraft}
                      onCreateBookmark={(bookmarkData) => addBookmark(bookmarkData)}
                      onDeleteBookmark={(bookmarkId) => deleteBookmark(bookmarkId)}
                      onNavigateToBookmark={(bookmark) => {
                        navigateToBookmark(bookmark.position);
                        setBookmarksOpen(false);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            <div className="text-right hidden sm:block">
              <h1 className="text-sm sm:text-lg font-semibold truncate max-w-[120px] sm:max-w-none">
                {bookData.title}
              </h1>
              <p className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-none">
                {bookData.isPersonalBook && bookData.chapters
                  ? bookData.chapters.find((ch: Chapter) => ch.chapterNumber === currentChapter)?.title || `Глава ${currentChapter}`
                  : `Глава ${currentChapter}`}
              </p>
            </div>
            <div className="text-left sm:hidden">
              <p className="text-xs text-muted-foreground">
                Глава {currentChapter}
              </p>
            </div>

            <div className="relative">
              <Button
                variant={settingsOpen ? "secondary" : "ghost"}
                size="icon"
                onClick={() => {
                  const nextOpen = !settingsOpen;
                  closeAllPanels();
                  setSettingsOpen(nextOpen);
                }}
                title="Настройки чтения"
                className="w-8 h-8 sm:w-10 sm:h-10"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
              {settingsOpen && (
                <div ref={settingsPanelRef} className="absolute right-0 top-full mt-2 w-[85vw] max-w-[320px] sm:w-80 bg-background text-foreground border rounded-md shadow-lg p-3 sm:p-4 z-50">
                  <ReaderControls
                    settings={settings}
                    onSettingsChange={updateSettingsWithAnchor}
                    onPreviewSettings={previewSettings}
                    onResetSettings={resetSettingsWithAnchor}
                  />
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </header>

      <main
        ref={scrollContainerRef}
        onScroll={scheduleProgressSave}
        className="flex-1 overflow-y-auto bg-background text-foreground"
      >
        <div
          ref={contentAreaRef}
          className="mx-auto px-3 sm:px-4 md:px-8 py-8 sm:py-12 reader-text-align"
          style={{
            width: "var(--reader-content-width, 90%)"
          }}
        >
          {mainContent}
        </div>
      </main>

      <ReaderProgressIndicators
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        error={syncError}
        userProgress={progress}
      />
    </div>
  );
}

export function ReaderWorkspace({ bookId: propBookId, clubId, params }: Readonly<ReaderWorkspaceProps>) {
  const [, setLocation] = useLocation();
  const routeParams = useParams();
  const bookId = propBookId || params?.bookId || routeParams.bookId;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentChapter, setCurrentChapter] = useState<number | null>(null); // null пока не загрузится progress
  const [tocOpen, setTocOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingScrollRestore, setPendingScrollRestore] = useState<PendingScrollRestore | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const manualRestoreCleanupRef = useRef<(() => void) | null>(null);
  const { bookmarks, isLoading: bookmarksLoading } = useBookmarks(bookId || "");
  const { mutate: addBookmark, isPending: isAddingBookmark } = useAddBookmark(bookId || "");
  const { mutate: deleteBookmark } = useDeleteBookmark(bookId || "");

  const {
    progress,
    progressLoading,
    refetchProgress,
    contentLoading,
    bookData,
    currentChapterContent,
    saveProgress,
  } = usePersonalReaderAdapter({
    bookId,
    currentChapter,
    clubId,
  });
  const {
    saveWithSync,
    isLocalSessionProgress,
    isSyncing,
    syncError,
    lastSyncTime,
  } = useReaderSyncState({ saveProgress });
  const {
    settings,
    updateSettings,
    resetSettings,
    syncStatus: _syncStatus,
    isLoading: _isLoadingReaderSettings,
    // isSaving is deprecated, replaced with syncStatus
  } = useSyncedReaderSettings("personal");
  
  // Analytics hooks
  const analytics = useAnalytics();
  
  // Инициализация currentChapter из прогресса при первой загрузке
  useEffect(() => {
    if (currentChapter !== null) return;
    const initial = getInitialChapter(progress, progressLoading);
    if (initial !== null) {
      setCurrentChapter(initial);
    }
  }, [progress, progressLoading, currentChapter]);

  useTrackReaderAnalytics({
    bookId,
    currentChapter,
    contentLoading,
    progress: progress ?? null,
    analytics
  });

  const scrollElementRef = scrollContainerRef as RefObject<HTMLElement | null>;
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const tocPanelRef = useRef<HTMLDivElement | null>(null);
  const bookmarksPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const closeAllPanels = useCallback(() => {
    setTocOpen(false);
    setBookmarksOpen(false);
    setSettingsOpen(false);
  }, []);
  const preserveReaderVisualAnchor = usePreserveReaderVisualAnchor({
    scrollContainerRef: scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
  });

  const previewSettings = useCallback((nextSettings: ReaderSettings) => {
    preserveReaderVisualAnchor(() => {
      applyReaderSettings(nextSettings, "personal");
    });
  }, [preserveReaderVisualAnchor]);

  const updateSettingsWithAnchor = useCallback((nextSettings: ReaderSettings) => {
    preserveReaderVisualAnchor(() => {
      updateSettings(nextSettings);
    });
  }, [preserveReaderVisualAnchor, updateSettings]);

  const resetSettingsWithAnchor = useCallback(() => {
    preserveReaderVisualAnchor(() => {
      resetSettings();
    });
  }, [preserveReaderVisualAnchor, resetSettings]);

  useReaderPanelsAutoclose({
    isOpen: tocOpen || bookmarksOpen || settingsOpen,
    onClose: closeAllPanels,
    contentRef: scrollElementRef,
    protectedRefs: [tocPanelRef, bookmarksPanelRef, settingsPanelRef],
  });

  const { suggestedProgress, dismissSuggestion } = useReaderLatestProgress({
    currentChapter,
    totalChapters: bookData.totalChapters,
    scrollContainerRef: scrollElementRef,
    remoteProgress: progress ?? null,
    refreshProgress: refetchProgress,
    enabled: currentChapter !== null && !progressLoading && bookData.totalChapters > 0,
    isLocalSessionProgress,
  });

  const { scheduleSave: scheduleProgressSave, saveNow: saveProgressNow } = useDebouncedReaderProgressSave({
    currentChapter,
    scrollContainerRef: scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
    totalChapters: bookData.totalChapters,
    onSave: saveWithSync,
    debounceMs: 1500,
    enabled: currentChapter !== null && bookData.totalChapters > 0,
  });

  useRestoreReaderScroll({
    scrollContainerRef: scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
    currentChapter,
    currentPositionRaw: progress?.currentPosition,
    contentReady: !contentLoading,
  });
  useSmoothReaderSpaceScroll({
    scrollContainerRef: scrollElementRef,
    enabled: currentChapter !== null,
  });
  const { selectionState, clearSelection } = useReaderSelectionBookmark({
    containerRef: scrollElementRef,
    enabled: currentChapter !== null && !contentLoading,
  });

  usePersistProgressOnUnmount({
    scrollContainerRef,
    bookData,
    currentChapter,
    clubId,
    bookId
  });

  usePendingBookmarkNavigation({
    bookId,
    currentChapter,
    setPendingScrollRestore,
    setCurrentChapter,
  });

  usePendingScrollRestore({
    pendingScrollRestore,
    contentLoading,
    currentChapter,
    scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
    manualRestoreCleanupRef,
    setPendingScrollRestore,
  });

  // Fullscreen API
  const toggleFullscreen = () => {
    const isActive = !!document.fullscreenElement;
    if (isActive) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  const { changeChapter } = useReaderChapterNavigation({
    currentChapter,
    chaptersLength: bookData.chapters?.length,
    scrollContainerRef,
    saveProgressNow,
    setCurrentChapter,
  });

  const {
    createCurrentBookmarkDraft,
    navigateToBookmark,
    addBookmarkFromSelection,
    openLatestPosition,
  } = useReaderSavedPositionActions({
    scrollContainerRef,
    currentChapter,
    totalChapters: bookData.totalChapters,
    selectionState,
    clearSelection,
    addBookmark,
    suggestedProgress,
    dismissSuggestion,
    setPendingScrollRestore,
    setCurrentChapter,
  });

  const handleMarkAsRead = useCallback(() => {
    saveProgressNow({
      chapter: currentChapter ?? 1,
      progressOverride: 100,
    });
  }, [currentChapter, saveProgressNow]);

  const mainContent = useMemo(() => (
    <ReaderMainContent
      contentLoading={contentLoading}
      currentChapterContent={currentChapterContent}
      currentChapter={currentChapter}
      bookData={bookData}
      setCurrentChapter={changeChapter}
      onMarkAsRead={handleMarkAsRead}
    />
  ), [
    contentLoading,
    currentChapterContent,
    currentChapter,
    bookData,
    changeChapter,
    handleMarkAsRead,
  ]);

  if (!bookId) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <p className="text-muted-foreground">Книга не найдена</p>
      </div>
    );
  }

  // Показываем загрузку пока определяется глава
  if (currentChapter === null || progressLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <ReaderWorkspaceView
      onBackToLibrary={() => setLocation("/library")}
      selectionState={selectionState}
      addBookmarkFromSelection={addBookmarkFromSelection}
      clearSelection={clearSelection}
      suggestedProgress={suggestedProgress}
      currentChapter={currentChapter}
      openLatestPosition={openLatestPosition}
      dismissSuggestion={dismissSuggestion}
      tocOpen={tocOpen}
      closeAllPanels={closeAllPanels}
      setTocOpen={setTocOpen}
      changeChapter={changeChapter}
      bookData={bookData}
      bookmarksOpen={bookmarksOpen}
      setBookmarksOpen={setBookmarksOpen}
      bookmarksLoading={bookmarksLoading}
      bookId={bookId}
      bookmarks={bookmarks}
      isAddingBookmark={isAddingBookmark}
      createCurrentBookmarkDraft={createCurrentBookmarkDraft}
      addBookmark={addBookmark}
      deleteBookmark={deleteBookmark}
      navigateToBookmark={navigateToBookmark}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      settings={settings}
      updateSettingsWithAnchor={updateSettingsWithAnchor}
      previewSettings={previewSettings}
      resetSettingsWithAnchor={resetSettingsWithAnchor}
      isFullscreen={isFullscreen}
      toggleFullscreen={toggleFullscreen}
      scrollContainerRef={scrollContainerRef}
      scheduleProgressSave={scheduleProgressSave}
      contentAreaRef={contentAreaRef}
      tocPanelRef={tocPanelRef}
      bookmarksPanelRef={bookmarksPanelRef}
      settingsPanelRef={settingsPanelRef}
      mainContent={mainContent}
      isSyncing={isSyncing}
      lastSyncTime={lastSyncTime}
      syncError={syncError}
      progress={progress}
    />
  );
}
