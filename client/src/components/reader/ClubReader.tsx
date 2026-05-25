import { useState, useEffect, useRef, useMemo, useCallback, type CSSProperties, type RefObject } from "react";
import { useParams } from "wouter";
import { cn } from "@/lib/utils";
import { useClubBookmarks } from "../../hooks/use-club-reader";
import { useAnalytics } from "../../hooks/use-analytics";
import { getMobileAnalyticsContext } from "@/lib/mobile-analytics";
import { resolveStudioPrepView } from "@/lib/studio-prep-view";
import { resolveReaderStudioViewState } from "@/lib/reader-studio-view";
import { ClubContentRenderer } from "./club/ClubContentRenderer";
import { ClubReaderControls } from "./club/ClubReaderControls";
import { ClubChapterList } from "./club/ClubNavigation";
import { BookmarksPanel } from "./BookmarksPanel";
import { LatestPositionPrompt } from "./LatestPositionPrompt";
import { LoadingIndicator, ChapterLoadingIndicator, ContentLoadingSkeleton } from "./LoadingIndicator";
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
import { saveReaderProgressToStorage } from "@/lib/reader-local-progress";
import { getAccessToken } from "@/lib/token-store";
import {
  useDebouncedReaderProgressSave,
  restoreReaderScrollPosition,
  useRestoreReaderScroll,
} from "./core/use-reader-progress-sync";
import { useReaderLatestProgress } from "./core/use-reader-latest-progress";
import { useReaderPanelsAutoclose } from "./core/use-reader-panels-autoclose";
import { usePreserveReaderVisualAnchor } from "./core/use-preserve-reader-visual-anchor";
import { useSmoothReaderSpaceScroll } from "./core/use-smooth-reader-space-scroll";
import { useClubReaderAdapter } from "./core/use-reader-data-adapters";
import { useSyncedReaderSettings } from "./core/use-synced-reader-settings";
import { useReaderSyncState } from "./core/use-reader-sync-state";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { ReadNowBubble } from "@/components/studio/ReadNowBubble";
import { LiveReadersBubble, ActiveReadersModal } from "@/components/studio/LiveReadersBubble";
import { ListenerOverlay } from "@/components/studio/ListenerOverlay";
import { useLiveReaders } from "@/hooks/use-live-readers";
import { useClubLiveListening } from "@/hooks/use-club-live-listening";
import { useStudioDeviceEligibility } from "@/hooks/use-studio-device-eligibility";
import { useStudioMode } from "@/hooks/use-studio-mode";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { EmbeddedClubStudioShell } from "@/components/studio/EmbeddedClubStudioShell";
import type { ReaderSettings } from "@/lib/reader-settings";

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
  const studioEligibility = useStudioDeviceEligibility();
  const isMobile = useIsMobile();
  const [currentChapter, setCurrentChapter] = useState<number | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tabletOverrideGranted, setTabletOverrideGranted] = useState(false);
  const [pendingScrollRestore, setPendingScrollRestore] = useState<PendingScrollRestore | null>(null);
  const chapterScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const manualRestoreCleanupRef = useRef<(() => void) | null>(null);
  const programmaticScrollUntilRef = useRef(0);

  // ── Авторизация ─────────────────────────────────────────────────────
  const { user } = useAuth();

  // ── Live-чтецы ────────────────────────────────────────────────────────
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [hasLocalReadingActivity, setHasLocalReadingActivity] = useState(false);
  // Последняя полученная позиция чтеца (для диалога после окончания стрима)
  const lastReaderPositionRef = useRef<{ chapter: number; positionRaw: string } | null>(null);
  // Предложение перейти к позиции чтеца после окончания стрима
  const [streamEndedSuggestion, setStreamEndedSuggestion] = useState<{ chapter: number; positionRaw: string } | null>(null);
  const tocPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const bookmarksPanelRef = useRef<HTMLDivElement | null>(null);
  const helpPanelRef = useRef<HTMLDivElement | null>(null);

  const applyReaderPosition = useCallback((chapter: number, positionRaw: string | null | undefined) => {
    if (!positionRaw) {
      setCurrentChapter(chapter);
      return;
    }

    lastReaderPositionRef.current = { chapter, positionRaw };
    setPendingScrollRestore({ chapter, positionRaw });
    setCurrentChapter(chapter);
  }, []);

  // ── Режим студии ─────────────────────────────────────────────────
  const [studioOpen, setStudioOpen] = useState(false);
  const studioAccessAllowed = studioEligibility.mode === "allowed"
    || (studioEligibility.mode === "override" && tabletOverrideGranted);

  useEffect(() => {
    if (studioEligibility.mode !== "override") {
      setTabletOverrideGranted(false);
    }
  }, [studioEligibility.mode]);

  useEffect(() => {
    if (!studioAccessAllowed && studioOpen) {
      setStudioOpen(false);
    }
  }, [studioAccessAllowed, studioOpen]);

  const handlePositionUpdate = useCallback((update: { chapter: number; positionRaw: string }) => {
    // Сохраняем последнюю позицию чтеца
    lastReaderPositionRef.current = { chapter: update.chapter, positionRaw: update.positionRaw };
    // Синхронизируем позицию ридера с чтецом
    if (update.chapter !== currentChapter) {
      setCurrentChapter(update.chapter);
    }
    setPendingScrollRestore({
      chapter: update.chapter,
      positionRaw: update.positionRaw,
    });
  }, [currentChapter]);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const markProgrammaticScroll = useCallback((holdMs: number = 400) => {
    programmaticScrollUntilRef.current = Date.now() + holdMs;
  }, []);
  const isProgrammaticScroll = useCallback(() => Date.now() < programmaticScrollUntilRef.current, []);
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
    clubProgress: _clubProgress,
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
  const {
    listeningState,
    listeningReader,
    startListening,
    stopListening,
  } = useClubLiveListening({
    clubId,
    bookId,
    bookTitle: bookData.title ?? "",
    bookAuthor: (bookData as { author?: string }).author,
    coverUrl: (bookData as { coverUrl?: string }).coverUrl,
  });
  const { readers, hasSnapshot, flashCount, announceLiveStart, announceLiveStop, broadcastPosition } = useLiveReaders({
    clubId,
    bookId,
    listeningToSessionId: listeningReader?.sessionId ?? null,
    onPositionUpdate: handlePositionUpdate,
  });

  const studio = useStudioMode({
    clubId,
    bookId,
    currentChapter: currentChapter ?? 1,
    readerName: user?.username ?? 'Чтец',
    userId: user?.id,
    enabled: studioOpen && studioAccessAllowed,
  });

  const embeddedStudioView = resolveReaderStudioViewState({
    state: studio.state,
    micCheckPassed: studio.micCheckPassed,
    isStartingBroadcast: studio.isStartingBroadcast,
    isSessionConnected: studio.session.isConnected,
    microphoneIssue: studio.microphoneIssue,
    microphoneLoading: studio.microphoneLoading,
    microphoneAvailable: studio.microphoneAvailable,
    microphoneError: studio.microphoneError,
    clubBookTitle: bookData.title ?? null,
    chapterTitle: null,
    currentChapter: currentChapter ?? 1,
  });

  const embeddedPrepView = resolveStudioPrepView({
    microphoneAvailable: studio.microphoneAvailable,
    microphoneError: studio.microphoneError,
    micCheckPassed: studio.micCheckPassed,
    isStartingBroadcast: studio.isStartingBroadcast,
    sessionConnected: studio.session.isConnected,
    sessionId: studio.session.sessionId ?? null,
  });

  // Если чтец, которого слушаем, ушёл — останавливаем плеер
  useEffect(() => {
    if (!listeningReader) return;
    if (!hasSnapshot) return;
    const still = readers.some((reader) => reader.sessionId === listeningReader.sessionId);
    if (!still) {
      if (lastReaderPositionRef.current) {
        setStreamEndedSuggestion(lastReaderPositionRef.current);
        lastReaderPositionRef.current = null;
      }
      stopListening();
    }
  }, [hasSnapshot, listeningReader, readers, stopListening]);

  // ── Трансляция позиции чтеца слушателям ───────────────────────────────
  const broadcastDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!studioOpen || studio.state !== 'live' || !studio.session.sessionId || currentChapter === null) return;
    broadcastPosition({
      sessionId: studio.session.sessionId,
      chapter: currentChapter,
      positionRaw: serializeReaderPosition({ scrollTop: 0, chapter: currentChapter }),
    });
  }, [studioOpen, studio.state, studio.session.sessionId, currentChapter, broadcastPosition]);
  const totalChapters = bookData.totalChapters || chapters.length || 1;
  const {
    rememberLocalProgress,
    saveWithSync,
    isLocalSessionProgress,
    isSyncing: _isSyncing,
    syncError: _syncError,
    lastSyncTime: _lastSyncTime,
  } = useReaderSyncState({ saveProgress });

  // Analytics tracking
  const analytics = useAnalytics();

  // Analytics: Track book open when content loads (only once)
  const hasTrackedBookOpen = useRef(false);
  useEffect(() => {
    if (outlineContent && bookId && !hasTrackedBookOpen.current) {
      analytics.trackBookOpen(
        bookId,
        getMobileAnalyticsContext({ source: "club_reader", clubId }) ?? { clubId },
      );
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

      setHasLocalReadingActivity(true);
       
      setCurrentChapter(newChapter);
      if (chapterScrollTimeoutRef.current) {
        clearTimeout(chapterScrollTimeoutRef.current);
      }
      chapterScrollTimeoutRef.current = setTimeout(() => {
        if (scrollContainerRef.current) {
          markProgrammaticScroll(500);
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
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[ClubReader] Failed to navigate to bookmark:', error);
      }
    }
  };

  // Функции для горячих клавиш
  const increaseFontSize = () => {
    updateSettingsWithAnchor({
      ...settings,
      fontSize: Math.min(32, settings.fontSize + 2),
    });
  };

  const decreaseFontSize = () => {
    updateSettingsWithAnchor({
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

  useEffect(() => {
    return () => {
      if (chapterScrollTimeoutRef.current) {
        clearTimeout(chapterScrollTimeoutRef.current);
      }
    };
  }, []);

  // Сохранение позиции локально и на сервере при размонтировании (keepalive)
  useEffect(() => {
    return () => {
      const container = scrollContainerRef.current;
      if (!container || currentChapter === null || totalChapters === 0) return;

      const payload = createReaderProgressPayload({
        currentChapter,
        totalChapters,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });

      saveReaderProgressToStorage({ type: "club", clubId, bookId }, payload);

      const token = getAccessToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token && token !== "null") {
        headers.Authorization = `Bearer ${token}`;
      }

      fetch(`/api/clubs/${clubId}/progress`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
        credentials: "include",
        keepalive: true,
      });
    };
  }, [scrollContainerRef, currentChapter, totalChapters, clubId, bookId]);

  const scrollElementRef = scrollContainerRef as RefObject<HTMLElement | null>;

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
      requireAtTop: true,
      scrollContainerRef: scrollElementRef,
    },
    {
      key: readerShortcuts.nextChapter.key,
      action: () => changeChapter(Math.min(bookData.totalChapters, (currentChapter || 1) + 1)),
      description: readerShortcuts.nextChapter.description,
      requireAtBottom: true,
      scrollContainerRef: scrollElementRef,
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

  const preserveReaderVisualAnchor = usePreserveReaderVisualAnchor({
    scrollContainerRef: scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
  });
  const closeAllPanels = useCallback(() => {
    setTocOpen(false);
    setSettingsOpen(false);
    setBookmarksOpen(false);
    setHelpOpen(false);
  }, []);

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
    isOpen: tocOpen || settingsOpen || bookmarksOpen || helpOpen,
    onClose: closeAllPanels,
    contentRef: scrollElementRef,
    protectedRefs: [tocPanelRef, settingsPanelRef, bookmarksPanelRef, helpPanelRef],
  });

  const { suggestedProgress, dismissSuggestion } = useReaderLatestProgress({
    currentChapter,
    totalChapters,
    scrollContainerRef: scrollElementRef,
    remoteProgress: userProgress ?? null,
    refreshProgress: refetchProgress,
    enabled: currentChapter !== null && !progressLoading && totalChapters > 0,
    hasLocalReadingActivity,
    isLocalSessionProgress,
  });
  const { scheduleSave: scheduleProgressSave, saveNow: saveProgressNow } = useDebouncedReaderProgressSave({
    scrollContainerRef: scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
    currentChapter,
    totalChapters,
    onSave: saveWithSync,
    debounceMs: 1000,
    enabled: !contentLoading && !!chapterContent && currentChapter !== null,
  });

  // Восстановление сохраненной позиции
  useEffect(() => {
    if (!progressLoading && currentChapter === null) {
      const savedChapter = userProgress?.currentChapter ?? 1;
      setCurrentChapter(savedChapter);
    }
  }, [progressLoading, currentChapter, userProgress?.currentChapter]);

  useRestoreReaderScroll({
    scrollContainerRef: scrollElementRef,
    contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
    currentChapter,
    currentPositionRaw: userProgress?.currentPosition,
    contentReady: !contentLoading && !!currentChapterContent,
    onProgrammaticScroll: markProgrammaticScroll,
    isProgrammaticScroll,
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
      contentAreaRef: contentAreaRef as RefObject<HTMLElement | null>,
      currentChapter,
      currentPositionRaw: pendingScrollRestore.positionRaw,
      onProgrammaticScroll: markProgrammaticScroll,
      delayMs: 120,
      retryAttempts: 5,
      retryDelayMs: 120,
    });
    setPendingScrollRestore(null);
  }, [contentLoading, currentChapter, pendingScrollRestore, scrollElementRef]);

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

  const liveReadersMobileBottom = studioEligibility.mode === "blocked"
    ? "bottom-[calc(env(safe-area-inset-bottom)+5rem)]"
    : "bottom-[calc(env(safe-area-inset-bottom)+8.5rem)]";

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {suggestedProgress && (
        <LatestPositionPrompt
          currentChapter={currentChapter}
          remoteChapter={suggestedProgress.currentChapter}
          onOpenLatest={openLatestPosition}
          onDismiss={dismissSuggestion}
        />
      )}

      {/* Диалог: чтец завершил стрим — предложить перейти к его позиции */}
      {streamEndedSuggestion && (
        <LatestPositionPrompt
          currentChapter={currentChapter}
          remoteChapter={streamEndedSuggestion.chapter}
          onOpenLatest={() => {
            setPendingScrollRestore(streamEndedSuggestion);
            setCurrentChapter(streamEndedSuggestion.chapter);
            setStreamEndedSuggestion(null);
          }}
          onDismiss={() => setStreamEndedSuggestion(null)}
        />
      )}

      {/* Верхняя панель */}
      <section className="border-b bg-background relative z-50 p-2 sm:p-4 shrink-0">
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
              onClick={() => {
                const nextOpen = !tocOpen;
                closeAllPanels();
                setTocOpen(nextOpen);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 p-0 shrink-0"
            >
              <List className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const nextOpen = !settingsOpen;
                closeAllPanels();
                setSettingsOpen(nextOpen);
              }}
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
            ref={settingsPanelRef}
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
                onSettingsChange={updateSettingsWithAnchor}
                onResetSettings={resetSettingsWithAnchor}
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
            ref={tocPanelRef}
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
            ref={bookmarksPanelRef}
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

      <EmbeddedClubStudioShell
        isOpen={studioOpen}
        state={studio.state}
        sessionId={studio.session.sessionId}
        bookTitle={embeddedStudioView.bookTitle}
        chapterTitle={embeddedStudioView.chapterTitle}
        networkQuality={embeddedStudioView.networkQuality}
        elapsedTime={studio.elapsedTime}
        listenerCount={studio.listenerCount}
        micMuted={studio.micMuted}
        micLevel={studio.micLevel}
        micBars={studio.micBars}
        sessionConnected={studio.session.isConnected}
        streamStartError={studio.streamStartError}
        micCheckPassed={studio.micCheckPassed}
        showMicCheck={studio.showMicCheck}
        microphoneAvailable={studio.microphoneAvailable}
        microphoneLoading={studio.microphoneLoading}
        microphoneError={studio.microphoneError}
        runtimeMicrophoneWarning={embeddedStudioView.runtimeMicrophoneWarning}
        prepStatusText={embeddedPrepView.prepStatusText}
        compactStartButtonLabel={embeddedPrepView.compactStartButtonLabel}
        startDisabled={embeddedPrepView.startDisabled}
        onBookmark={() => setBookmarksOpen(true)}
        onTextSettings={() => setSettingsOpen(true)}
        onMicToggle={() => studio.setMicMuted(!studio.micMuted)}
        onPause={studio.handlePause}
        onResume={studio.handleResume}
        onRequestEnd={studio.requestEnd}
        onConfirmEnd={() =>
          studio.handleEnd((sessionId) => {
            announceLiveStop(sessionId);
            setStudioOpen(false);
          })
        }
        onCancelEnd={studio.cancelEnd}
        phase={studio.phase}
        onCloseSummary={studio.closeSummary}
        onMicCheckComplete={studio.completeMicCheck}
        onMicCheckSkip={studio.skipMicCheck}
        onRetryDetection={studio.retryDetection}
        onStartBroadcast={() => {
          void studio.handleStartBroadcast((sessionId) => {
            announceLiveStart({
              sessionId,
              chapter: currentChapter ?? 1,
              readerName: user?.username ?? 'Чтец',
            });
          });
        }}
        onOpenMicCheck={studio.openMicCheck}
        onCloseStudio={() => setStudioOpen(false)}
      >
        {/* Основная область с боковыми панелями */}
        <div className="flex-1 min-h-0 flex relative overflow-hidden">
          {/* Основной контент */}
          <main className={cn("flex-1 min-h-0 flex flex-col relative transition-[filter] duration-300", listeningReader && "blur-sm pointer-events-none select-none")}>
            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
              onScroll={() => {
                if (isProgrammaticScroll()) {
                  return;
                }
                if (!hasLocalReadingActivity) {
                  setHasLocalReadingActivity(true);
                }
                scheduleProgressSave();
                // Транслируем позицию слушателям (debounce 2s)
                if (studioOpen && studio.state === 'live' && studio.session.sessionId && scrollContainerRef.current && currentChapter !== null) {
                  if (broadcastDebounceRef.current) clearTimeout(broadcastDebounceRef.current);
                  broadcastDebounceRef.current = setTimeout(() => {
                    if (!scrollContainerRef.current || currentChapter === null) return;
                    broadcastPosition({
                      sessionId: studio.session.sessionId!,
                      chapter: currentChapter,
                      positionRaw: serializeReaderPosition({ scrollTop: scrollContainerRef.current.scrollTop, chapter: currentChapter }),
                    });
                  }, 2000);
                }
              }}
            >
              <div 
                ref={contentAreaRef}
                className="club-reader-content p-4 sm:p-6 md:p-8"
                data-club-reader-surface-theme={settings.theme}
                style={{
                  fontFamily: 'var(--club-reader-font-family, inherit)',
                  fontSize: 'var(--club-reader-font-size, 18px)',
                  lineHeight: 'var(--club-reader-line-height, 1.6)',
                  textAlign: 'var(--club-reader-text-align, justify)' as CSSProperties['textAlign'],
                  width: 'var(--club-reader-content-width, 90%)',
                  margin: '0 auto',
                } as CSSProperties}
              >
                {mainContent}
              </div>
            </div>
          </main>
        </div>
      </EmbeddedClubStudioShell>

      {/* Справка по горячим клавишам */}
      <KeyboardHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Пузыри над чатом: живые чтецы + кнопка читать вслух */}
      {!studioOpen && (
        <>
          <div className={cn(
            "fixed z-30 transition-transform duration-300 ease-out",
            isMobile
              ? `right-3 translate-x-0 pr-0 ${liveReadersMobileBottom}`
              : [
                  "right-0 translate-x-[calc(100%-4rem)] pr-4 hover:translate-x-0 focus-within:translate-x-0",
                  studioEligibility.mode === "blocked" ? "bottom-20" : "bottom-36",
                ].join(" "),
          )}>
            <LiveReadersBubble
              readers={readers}
              flashCount={flashCount}
              onOpenModal={() => setLiveModalOpen(true)}
              compact={isMobile}
            />
          </div>

          {studioEligibility.mode !== "blocked" && (
            <div className={cn(
              "fixed z-30 transition-transform duration-300 ease-out",
              isMobile
                ? "bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-3 translate-x-0 pr-0"
                : "bottom-20 right-0 translate-x-[calc(100%-4rem)] pr-4 hover:translate-x-0 focus-within:translate-x-0",
            )}>
              <ReadNowBubble
                onClick={() => {
                  if (studioEligibility.mode === "override" && !tabletOverrideGranted) {
                    setTabletOverrideGranted(true);
                  }

                  setStudioOpen(true);
                }}
                title={
                  studioEligibility.mode === "override" && !tabletOverrideGranted
                    ? "Открыть Studio с подтверждением для планшета"
                    : undefined
                }
                compact={isMobile}
              />
            </div>
          )}
        </>
      )}

      {/* Чат клуба */}
      <ChatWidget clubId={clubId} mobileTopOffsetPx={72} />

      {/* Модалка активных чтецов */}
      <ActiveReadersModal
        open={liveModalOpen}
        onClose={() => setLiveModalOpen(false)}
        readers={readers}
        listeningToSessionId={listeningReader?.sessionId ?? null}
        onPlay={async (reader) => {
          const activeListening = await startListening(reader);
          if (activeListening.reader.positionRaw) {
            applyReaderPosition(activeListening.reader.chapter, activeListening.reader.positionRaw);
            return;
          }

          if (activeListening.reader.chapter !== currentChapter) {
            setCurrentChapter(activeListening.reader.chapter);
          }
        }}
        onStop={async () => {
          stopListening();
        }}
      />

      {/* Оверлей плеера слушателя */}
      {listeningState && (
        <ListenerOverlay
          reader={listeningState.reader}
          bookTitle={listeningState.bookTitle}
          bookAuthor={listeningState.bookAuthor}
          coverUrl={listeningState.coverUrl}
          isPaused={Boolean(listeningState.reader.isPaused)}
          onStop={() => {
            lastReaderPositionRef.current = null;
            stopListening();
          }}
          onStreamEnded={() => {
            if (lastReaderPositionRef.current) {
              setStreamEndedSuggestion(lastReaderPositionRef.current);
              lastReaderPositionRef.current = null;
            }
            stopListening({ stopPlayback: false });
          }}
        />
      )}
    </div>
  );
}
