import { useState, useEffect, useRef, useMemo, type CSSProperties, type RefObject } from "react";
import { useParams } from "wouter";
import { useClubBookmarks } from "../../hooks/use-club-reader";
import { useAnalytics } from "../../hooks/use-analytics";
import { ClubContentRenderer } from "./club/ClubContentRenderer";
import { ClubReaderControls } from "./club/ClubReaderControls";
import { ClubChapterList } from "./club/ClubNavigation";
import { BookmarksPanel } from "./BookmarksPanel";
import { LatestPositionPrompt } from "./LatestPositionPrompt";
import { LoadingIndicator, ChapterLoadingIndicator, ContentLoadingSkeleton } from "./LoadingIndicator";
import { ReaderProgressIndicators } from "./ReaderProgressIndicators";
import { useKeyboardShortcuts, readerShortcuts } from "./useKeyboardShortcuts";
import { KeyboardHelp } from "./KeyboardHelp";
import { Button } from "../ui/button";
import { List, Settings, ArrowLeft, HelpCircle } from "lucide-react";
import type { Bookmark as BookmarkType } from "@shared/schema";
import {
  createReaderProgressPayload,
  parseReaderPosition,
  serializeReaderPosition,
} from "./core/reader-progress-core";
import {
  useDebouncedReaderProgressSave,
  restoreReaderScrollPosition,
  useRestoreReaderScroll,
} from "./core/use-reader-progress-sync";
import { useReaderLatestProgress } from "./core/use-reader-latest-progress";
import { useSmoothReaderSpaceScroll } from "./core/use-smooth-reader-space-scroll";
import { useClubReaderAdapter } from "./core/use-reader-data-adapters";
import { useSyncedReaderSettings } from "./core/use-synced-reader-settings";
import { useReaderSyncState } from "./core/use-reader-sync-state";
import { ChatWidget } from "@/components/chat/ChatWidget";

interface ClubReaderProps {
  clubId?: string;
  bookId?: string;
  params?: {
    clubId?: string;
    bookId?: string;
  };
}

export function ClubReader({ clubId: propClubId, bookId: propBookId, params }: Readonly<ClubReaderProps>) {
  const routeParams = useParams();
  const clubId = propClubId || params?.clubId || routeParams.clubId;
  const bookId = propBookId || params?.bookId || routeParams.bookId;
  if (!clubId || !bookId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Неверные параметры ридера</p>
      </div>
    );
  }

  return <ClubReaderInner clubId={clubId} bookId={bookId} />;
}

interface ClubReaderInnerProps {
  clubId: string;
  bookId: string;
}

interface PendingScrollRestore {
  chapter: number;
  positionRaw: string;
}

function ClubReaderInner({ clubId, bookId }: Readonly<ClubReaderInnerProps>) {
  const [currentChapter, setCurrentChapter] = useState<number | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingScrollRestore, setPendingScrollRestore] = useState<PendingScrollRestore | null>(null);
  const chapterScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const bookmarkScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const manualRestoreCleanupRef = useRef<(() => void) | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const {
    settings,
    updateSettings,
    resetSettings,
    syncStatus: _syncStatus,
    isLoading: _isLoadingReaderSettings,
    // isSaving is deprecated, replaced with syncStatus
  } = useSyncedReaderSettings("club", { cleanupOnUnmount: true });

  // Загрузка закладок
  const { bookmarks, isLoading: bookmarksLoading } = useClubBookmarks(clubId);

  const {
    progressLoading,
    userProgress,
    clubProgress,
    outlineContent,
    chapterContent,
    contentLoading,
    bookData,
    chapters,
    currentChapterContent,
    refetchProgress,
    saveProgress,
  } = useClubReaderAdapter({
    clubId,
    bookId,
    currentChapter,
  });
  const totalChapters = bookData.totalChapters || chapters.length || 1;
  const {
    rememberLocalProgress,
    saveWithSync,
    isLocalSessionProgress,
    isSyncing,
    syncError,
    lastSyncTime,
  } = useReaderSyncState({ saveProgress });

  // Analytics tracking
  const analytics = useAnalytics();

  // Analytics: Track book open when content loads (only once)
  const hasTrackedBookOpen = useRef(false);
  useEffect(() => {
    if (outlineContent && bookId && !hasTrackedBookOpen.current) {
      analytics.trackBookOpen(bookId, { clubId });
      hasTrackedBookOpen.current = true;
    }
  }, [outlineContent, bookId, clubId, analytics]);

  // Analytics: Track chapter start when chapter changes (prevent duplicates)
  const lastTrackedChapter = useRef<number | null>(null);
  useEffect(() => {
    if (currentChapter != null && bookId && currentChapter !== lastTrackedChapter.current) {
      analytics.trackChapterStart(bookId, currentChapter, clubId);
      analytics.startReadingSession(bookId, currentChapter, clubId);
      lastTrackedChapter.current = currentChapter;
    }
    return () => {
      analytics.stopReadingSession();
    };
  }, [currentChapter, bookId, clubId, analytics]);

  // Analytics: Track book completion when progress reaches 100% (only once)
  const hasTrackedCompletion = useRef(false);
  useEffect(() => {
    if (userProgress?.progress === 100 && bookId && !hasTrackedCompletion.current) {
      analytics.trackBookComplete(bookId, clubId);
      hasTrackedCompletion.current = true;
    }
  }, [userProgress?.progress, bookId, clubId, analytics]);

  const normalizedBookmarks = useMemo<BookmarkType[]>(() => {
    return bookmarks.map((bookmark) => {
      const chapterNumber = bookmark.chapter ? Number.parseInt(bookmark.chapter, 10) : null;
      const safeChapter = Number.isFinite(chapterNumber) ? chapterNumber : null;
      const scrollTop = typeof bookmark.position === "number" ? bookmark.position : 0;
      const position = serializeReaderPosition({
        scrollTop,
        chapter: safeChapter ?? undefined,
      });
      return {
        id: bookmark.id,
        userId: bookmark.createdBy,
        bookId,
        chapterNumber: safeChapter,
        position,
        title: bookmark.title,
        createdAt: bookmark.createdAt,
      };
    });
  }, [bookmarks, bookId]);

  // Смена главы с сохранением текущей позиции
  const changeChapter = (newChapter: number) => {
    const maxChapter = totalChapters;
    if (newChapter >= 1 && newChapter <= maxChapter) {
      // Сохраняем текущую позицию перед сменой главы
      if (scrollContainerRef.current && currentChapter) {
        const payload = createReaderProgressPayload({
          currentChapter,
          totalChapters,
          scrollTop: scrollContainerRef.current.scrollTop,
          scrollHeight: scrollContainerRef.current.scrollHeight,
          clientHeight: scrollContainerRef.current.clientHeight,
        });

        // Сохраняем позицию без индикатора синхронизации (фоновое сохранение)
        rememberLocalProgress(payload);
        saveProgress(payload);
      }
      
      setCurrentChapter(newChapter);
      if (chapterScrollTimeoutRef.current) {
        clearTimeout(chapterScrollTimeoutRef.current);
      }
      chapterScrollTimeoutRef.current = setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
      }, 100);
    }
  };

  // Навигация к закладке
  const navigateToBookmark = (bookmark: BookmarkType) => {
    try {
      const position = parseReaderPosition(bookmark.position);
      if (position?.chapter) {
        setPendingScrollRestore({
          chapter: position.chapter,
          positionRaw: bookmark.position,
        });
        setCurrentChapter(position.chapter);
        if (bookmarkScrollTimeoutRef.current) {
          clearTimeout(bookmarkScrollTimeoutRef.current);
        }
        bookmarkScrollTimeoutRef.current = null;
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[ClubReader] Failed to navigate to bookmark:', error);
      }
    }
  };

  // Функции для горячих клавиш
  const increaseFontSize = () => {
    updateSettings({
      ...settings,
      fontSize: Math.min(32, settings.fontSize + 2),
    });
  };

  const decreaseFontSize = () => {
    updateSettings({
      ...settings,
      fontSize: Math.max(12, settings.fontSize - 2),
    });
  };

  const toggleFullscreen = () => {
    const isFullscreen = !!document.fullscreenElement;
    if (isFullscreen) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  // Горячие клавиши
  useKeyboardShortcuts([
    {
      key: readerShortcuts.toggleToc.key,
      action: () => setTocOpen(!tocOpen),
      description: readerShortcuts.toggleToc.description,
    },
    {
      key: readerShortcuts.toggleBookmarks.key,
      action: () => setBookmarksOpen(!bookmarksOpen),
      description: readerShortcuts.toggleBookmarks.description,
    },
    {
      key: readerShortcuts.toggleSettings.key,
      action: () => setSettingsOpen(!settingsOpen),
      description: readerShortcuts.toggleSettings.description,
    },
    {
      key: readerShortcuts.prevChapter.key,
      action: () => changeChapter(Math.max(1, (currentChapter || 1) - 1)),
      description: readerShortcuts.prevChapter.description,
    },
    {
      key: readerShortcuts.nextChapter.key,
      action: () => changeChapter(Math.min(bookData.totalChapters, (currentChapter || 1) + 1)),
      description: readerShortcuts.nextChapter.description,
    },
    {
      key: readerShortcuts.fontSizeIncrease.key,
      ctrlKey: readerShortcuts.fontSizeIncrease.ctrlKey,
      action: increaseFontSize,
      description: readerShortcuts.fontSizeIncrease.description,
    },
    {
      key: readerShortcuts.fontSizeDecrease.key,
      ctrlKey: readerShortcuts.fontSizeDecrease.ctrlKey,
      action: decreaseFontSize,
      description: readerShortcuts.fontSizeDecrease.description,
    },
    {
      key: readerShortcuts.fullscreen.key,
      action: toggleFullscreen,
      description: readerShortcuts.fullscreen.description,
    },
    {
      key: readerShortcuts.back.key,
      action: () => globalThis.history.back(),
      description: readerShortcuts.back.description,
    },
  ]);

  useEffect(() => {
    return () => {
      if (chapterScrollTimeoutRef.current) {
        clearTimeout(chapterScrollTimeoutRef.current);
      }
      if (bookmarkScrollTimeoutRef.current) {
        clearTimeout(bookmarkScrollTimeoutRef.current);
      }
    };
  }, []);

  const scrollElementRef = scrollContainerRef as RefObject<HTMLElement | null>;
  const { suggestedProgress, dismissSuggestion } = useReaderLatestProgress({
    currentChapter,
    totalChapters,
    scrollContainerRef: scrollElementRef,
    remoteProgress: userProgress ?? null,
    refreshProgress: refetchProgress,
    enabled: currentChapter !== null && !progressLoading && totalChapters > 0,
    isLocalSessionProgress,
  });
  const { scheduleSave: scheduleProgressSave, saveNow: saveProgressNow } = useDebouncedReaderProgressSave({
    scrollContainerRef: scrollElementRef,
    currentChapter,
    totalChapters,
    onSave: saveWithSync,
    debounceMs: 1000,
    enabled: !contentLoading && !!chapterContent && currentChapter !== null,
  });

  // Восстановление сохраненной позиции
  useEffect(() => {
    if (!progressLoading && currentChapter === null) {
      const savedChapter = userProgress?.currentChapter || 1;
      setCurrentChapter(savedChapter);
    }
  }, [progressLoading, currentChapter, userProgress?.currentChapter]);

  useRestoreReaderScroll({
    scrollContainerRef: scrollElementRef,
    currentChapter,
    currentPositionRaw: userProgress?.currentPosition,
    contentReady: !contentLoading && !!chapterContent,
  });
  useSmoothReaderSpaceScroll({
    scrollContainerRef: scrollElementRef,
    enabled: currentChapter !== null,
  });

  useEffect(() => {
    return () => {
      manualRestoreCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!pendingScrollRestore || contentLoading || currentChapter !== pendingScrollRestore.chapter) {
      return;
    }

    manualRestoreCleanupRef.current?.();
    manualRestoreCleanupRef.current = restoreReaderScrollPosition({
      scrollContainerRef: scrollElementRef,
      currentChapter,
      currentPositionRaw: pendingScrollRestore.positionRaw,
      delayMs: 120,
      retryAttempts: 5,
      retryDelayMs: 120,
    });
    setPendingScrollRestore(null);
  }, [contentLoading, currentChapter, pendingScrollRestore, scrollElementRef]);

  // Обработка скролла с дебаунсингом
  const handleScroll = () => {
    scheduleProgressSave();
  };

  const openLatestPosition = () => {
    if (!suggestedProgress) {
      return;
    }

    dismissSuggestion();
    setPendingScrollRestore({
      chapter: suggestedProgress.currentChapter,
      positionRaw: suggestedProgress.currentPosition,
    });
    setCurrentChapter(suggestedProgress.currentChapter);
  };

  const mainContent = useMemo(() => {
    if (contentLoading && currentChapter != null) {
      return <ChapterLoadingIndicator />;
    }
    if (currentChapterContent) {
      return (
        <>
          <ClubContentRenderer content={currentChapterContent} />
          
          {/* Навигация по главам */}
          {chapters.length > 1 && (
            <div className="flex flex-wrap justify-between items-center gap-2 mt-12 pt-8 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeChapter(Math.max(1, (currentChapter ?? 1) - 1))}
                disabled={(currentChapter ?? 1) <= 1}
                className="px-3 sm:px-8 py-2 text-xs sm:text-base"
              >
                ← Пред.
              </Button>
              <span className="text-xs sm:text-sm text-muted-foreground order-first sm:order-none w-full sm:w-auto text-center sm:text-left">
                Глава {currentChapter ?? 1} из {bookData.totalChapters}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeChapter(Math.min(bookData.totalChapters, (currentChapter ?? 1) + 1))}
                disabled={(currentChapter ?? 1) >= bookData.totalChapters}
                className="px-3 sm:px-8 py-2 text-xs sm:text-base"
              >
                След. →
              </Button>
            </div>
          )}
          {currentChapter !== null && currentChapter === bookData.totalChapters && (
            <div className="mt-6 flex justify-end">
              <Button
                variant="default"
                onClick={() => {
                  saveProgressNow({
                    chapter: currentChapter,
                    progressOverride: 100,
                  });
                }}
              >
                Отметить как прочитанное
              </Button>
            </div>
          )}
        </>
      );
    }
    return <ContentLoadingSkeleton />;
  }, [
    contentLoading,
    currentChapter,
    currentChapterContent,
    chapters.length,
    bookData.totalChapters,
    changeChapter,
    saveProgressNow,
  ]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {suggestedProgress && (
        <LatestPositionPrompt
          currentChapter={currentChapter}
          remoteChapter={suggestedProgress.currentChapter}
          onOpenLatest={openLatestPosition}
          onDismiss={dismissSuggestion}
        />
      )}

      {/* Верхняя панель */}
      <section className="border-b bg-card p-2 sm:p-4 shrink-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="outline" size="sm" onClick={() => globalThis.history.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-semibold truncate">{bookData.title}</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Клубное чтение</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTocOpen(!tocOpen)}
              className="w-8 h-8 sm:w-10 sm:h-10 p-0 shrink-0"
            >
              <List className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Настройки чтения"
              className="w-8 h-8 sm:w-10 sm:h-10 p-0 shrink-0"
            >
              <Settings className="w-4 h-4" />
            </Button>
            
            {/* Закладки временно скрыты до включения функционала в UI
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBookmarksOpen(!bookmarksOpen)}
              title="Закладки"
              className="w-8 h-8 sm:w-10 sm:h-10 p-0"
            >
              <Bookmark className="w-4 h-4" />
            </Button>
            */}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHelpOpen(true)}
              title="Горячие клавиши"
              className="w-8 h-8 sm:w-10 sm:h-10 p-0 hidden"
            >
              <HelpCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>
        </section>

      {/* Модальное окно настроек */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end pointer-events-none"
        >
          <div
            className="bg-background border rounded-lg shadow-xl w-[85vw] max-w-[320px] sm:max-w-md max-h-[80vh] pointer-events-auto mr-2 sm:mr-4"
          >
            <div className="sticky top-0 bg-background border-b p-3 sm:p-4 flex items-center justify-between">
              <h2 className="text-sm sm:text-lg font-semibold">Настройки</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="p-3 sm:p-4">
              <ClubReaderControls
                settings={settings}
                onSettingsChange={updateSettings}
                onResetSettings={resetSettings}
              />
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно оглавления */}
      {tocOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end pointer-events-none"
        >
          <div
            className="bg-background border rounded-lg shadow-xl w-[85vw] max-w-[320px] sm:max-w-md max-h-[80vh] overflow-y-auto pointer-events-auto mr-2 sm:mr-4 flex flex-col"
          >
            <div className="sticky top-0 bg-background border-b p-3 sm:p-4 flex items-center justify-between flex-none">
              <h2 className="text-sm sm:text-lg font-semibold">Оглавление</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTocOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="p-3 sm:p-4 flex-1">
              <ClubChapterList
                chapters={chapters}
                currentChapter={currentChapter || 1}
                onChapterSelect={(chapter) => {
                  changeChapter(chapter);
                  setTocOpen(false);
                }}
                isVisible={tocOpen}
                onClose={() => setTocOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно закладок */}
      {bookmarksOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end pointer-events-none"
        >
          <div
            className="bg-background border rounded-lg shadow-xl w-[85vw] max-w-[320px] sm:max-w-md max-h-[80vh] overflow-y-auto pointer-events-auto mr-2 sm:mr-4 flex flex-col"
          >
            <div className="sticky top-0 bg-background border-b p-3 sm:p-4 flex items-center justify-between flex-none">
              <h2 className="text-sm sm:text-lg font-semibold">Закладки</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBookmarksOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="p-3 sm:p-4 flex-1">
              {bookmarksLoading ? (
                <LoadingIndicator message="Загрузка..." />
              ) : (
                <BookmarksPanel
                  bookId={bookId}
                  bookmarks={normalizedBookmarks}
                  onNavigateToBookmark={(bookmark) => {
                    navigateToBookmark(bookmark);
                    setBookmarksOpen(false);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Основная область с боковыми панелями */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Основной контент */}
        <main className="flex-1 flex flex-col relative">
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto"
            onScroll={handleScroll}
          >
            <div 
              className="p-4 sm:p-6 md:p-8"
              style={{
                fontFamily: 'var(--club-reader-font-family, inherit)',
                fontSize: 'var(--club-reader-font-size, 18px)',
                lineHeight: 'var(--club-reader-line-height, 1.6)',
                maxWidth: 'var(--club-reader-content-width, 800px)',
                margin: '0 auto'
              } as CSSProperties}
            >
              {mainContent}
            </div>
          </div>
        </main>
      </div>

      <ReaderProgressIndicators
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        error={syncError}
        userProgress={userProgress}
        groupProgress={clubProgress}
        groupLabel="Клуб"
        panelAriaLabel="Панель прогресса клуба"
      />

      {/* Справка по горячим клавишам */}
      <KeyboardHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Чат клуба */}
      <ChatWidget clubId={clubId} />
    </div>
  );
}
