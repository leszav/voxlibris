import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "wouter";
import { useClubBookContent, useClubReadingProgress, useUpdateClubProgress, useClubBookmarks } from "../../hooks/use-club-reader";
import { useAnalytics } from "../../hooks/use-analytics";
import { ClubContentRenderer } from "./club/ClubContentRenderer";
import { ClubReaderControls } from "./club/ClubReaderControls";
import { ClubChapterList } from "./club/ClubNavigation";
import { BookmarksPanel } from "./BookmarksPanel";
import { LoadingIndicator, ChapterLoadingIndicator, ContentLoadingSkeleton } from "./LoadingIndicator";
import { CompactSyncIndicator } from "./SyncIndicator";
import { useKeyboardShortcuts, readerShortcuts } from "./useKeyboardShortcuts";
import { KeyboardHelp } from "./KeyboardHelp";
import { Button } from "../ui/button";
import { List, Settings, ArrowLeft, HelpCircle } from "lucide-react";
import type { Bookmark as BookmarkType } from "@shared/schema";

interface ChapterData {
  chapterNumber: number;
  title?: string;
  content?: string;
}

interface BookData {
  title: string;
  chapters?: ChapterData[];
  totalChapters?: number;
  content?: string;
  isPersonalBook?: boolean;
}

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

function ClubReaderInner({ clubId, bookId }: Readonly<ClubReaderInnerProps>) {
  const [currentChapter, setCurrentChapter] = useState<number | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [progressVisible, setProgressVisible] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const progressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressContainerRef = useRef<HTMLElement>(null);

  // Управление шрифтом для горячих клавиш
  const [fontSize, setFontSize] = useState(16);

  // Загрузка прогресса
  const { data: progress, isLoading: progressLoading } = useClubReadingProgress(clubId, bookId);
  
  // Загрузка всех глав
  const { data: allContent } = useClubBookContent(clubId, bookId);
  
  // Загрузка закладок
  const { bookmarks, isLoading: bookmarksLoading } = useClubBookmarks(clubId);

  // Загрузка текущей главы
  const { data: content, isLoading: contentLoading } = useClubBookContent(
    clubId,
    bookId,
    currentChapter ?? undefined,
    currentChapter != null
  );

  const { mutate: updateProgress } = useUpdateClubProgress(clubId);

  // Analytics tracking
  const analytics = useAnalytics();

  // Адаптация данных
  const bookData = useMemo(() => {
    if (allContent?.chapters) {
      return {
        title: allContent.title,
        chapters: allContent.chapters,
        totalChapters: allContent.totalChapters || allContent.chapters.length,
        isPersonalBook: false,
      };
    } else if (content?.chapters) {
      return {
        title: content.title,
        chapters: content.chapters,
        totalChapters: content.totalChapters || content.chapters.length,
        isPersonalBook: false,
      };
    } else if (content) {
      return {
        title: content.title,
        content: content.content,
        totalChapters: content.totalChapters || 1,
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
  }, [allContent, content]);

  // Analytics: Track book open when content loads (only once)
  const hasTrackedBookOpen = useRef(false);
  useEffect(() => {
    if (allContent && bookId && !hasTrackedBookOpen.current) {
      analytics.trackBookOpen(bookId, { clubId });
      hasTrackedBookOpen.current = true;
    }
  }, [allContent, bookId, clubId]);

  // Analytics: Track chapter start when chapter changes (prevent duplicates)
  const lastTrackedChapter = useRef<number | null>(null);
  useEffect(() => {
    if (currentChapter != null && bookId && currentChapter !== lastTrackedChapter.current) {
      analytics.trackChapterStart(bookId, currentChapter);
      analytics.startReadingSession(bookId, currentChapter);
      lastTrackedChapter.current = currentChapter;
    }
    return () => {
      analytics.stopReadingSession();
    };
  }, [currentChapter, bookId]);

  // Analytics: Track book completion when progress reaches 100% (only once)
  const hasTrackedCompletion = useRef(false);
  useEffect(() => {
    if (progress?.userProgress?.progress === 100 && bookId && !hasTrackedCompletion.current) {
      analytics.trackBookComplete(bookId);
      hasTrackedCompletion.current = true;
    }
  }, [progress?.userProgress?.progress, bookId]);

  // Получение текущей главы
  const currentChapterContent = useMemo(() => {
    if (content?.content && currentChapter != null) {
      return content.content;
    }
    if (bookData.chapters && currentChapter != null) {
      const chapter = bookData.chapters.find((ch: ChapterData) => ch.chapterNumber === currentChapter);
      return chapter?.content || "";
    }
    return bookData.content || "";
  }, [content, bookData.chapters, currentChapter, bookData.content]);

  // Получение списка глав
  const chapters = useMemo(() => {
    return bookData.chapters || [];
  }, [bookData]);

  // Смена главы с сохранением текущей позиции
  const changeChapter = (newChapter: number) => {
    const maxChapter = bookData.totalChapters || chapters.length;
    if (newChapter >= 1 && newChapter <= maxChapter) {
      // Сохраняем текущую позицию перед сменой главы
      if (scrollContainerRef.current && currentChapter) {
        const scrollTop = scrollContainerRef.current.scrollTop;
        const scrollHeight = scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight;
        const scrollPercent = Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100));
        
        const position = JSON.stringify({
          chapter: currentChapter,
          scrollTop,
          timestamp: Date.now()
        });
        
        const totalChapters = bookData.totalChapters || chapters.length || 1;
        const progressPercent = Math.round(((currentChapter - 1) / totalChapters + scrollPercent / 100 / totalChapters) * 100);

        // Сохраняем позицию без индикатора синхронизации (фоновое сохранение)
        updateProgress({
          currentChapter,
          currentPosition: position,
          progress: progressPercent
        });
      }
      
      setCurrentChapter(newChapter);
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
      }, 100);
    }
  };

  // Навигация к закладке
  const navigateToBookmark = (bookmark: BookmarkType) => {
    try {
      const position = JSON.parse(bookmark.position);
      if (position.chapter) {
        setCurrentChapter(position.chapter);
        setTimeout(() => {
          if (scrollContainerRef.current && position.scrollTop) {
            scrollContainerRef.current.scrollTop = position.scrollTop;
          }
        }, 200);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[ClubReader] Failed to navigate to bookmark:', error);
      }
    }
  };

  // Функции для горячих клавиш
  const increaseFontSize = () => {
    setFontSize(prev => Math.min(32, prev + 2));
  };

  const decreaseFontSize = () => {
    setFontSize(prev => Math.max(12, prev - 2));
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

  // Восстановление сохраненной позиции
  useEffect(() => {
    if (!progressLoading && progress && currentChapter === null) {
      const savedChapter = progress.userProgress?.currentChapter || 1;
      setCurrentChapter(savedChapter);
      
      // Восстанавливаем позицию в главе после загрузки контента
      setTimeout(() => {
        if (progress.userProgress?.currentPosition) {
          try {
            const position = JSON.parse(progress.userProgress.currentPosition);
            if (position.chapter === savedChapter && position.scrollTop && scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = position.scrollTop;
            }
            } catch (error) {
            if (import.meta.env.DEV) {
              console.error('[ClubReader] Failed to restore position:', error);
            }
          }
        }
      }, 300);
    } else if (!progressLoading && !progress && currentChapter === null) {
      setCurrentChapter(1);
    }
  }, [progress, progressLoading, currentChapter]);

  // Автоскрытие панели прогресса
  useEffect(() => {
    const hideProgress = () => {
      setProgressVisible(false);
    };

    const resetTimer = () => {
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
      }
      
      progressTimeoutRef.current = setTimeout(hideProgress, 3000);
    };

    resetTimer();

    return () => {
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
      }
    };
  }, [progress, currentChapter]);

  // Сохранение прогресса при скролле
  const saveProgress = () => {
    if (!scrollContainerRef.current || !currentChapter || !content) return;

    setIsSyncing(true);
    setSyncError(null);

    const container = scrollContainerRef.current;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight - container.clientHeight;
    const scrollPercent = Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100));
    
    const position = JSON.stringify({
      chapter: currentChapter,
      scrollTop,
      timestamp: Date.now()
    });
    
    const totalChapters = bookData.totalChapters || chapters.length || 1;
    const progressPercent = Math.round(((currentChapter - 1) / totalChapters + scrollPercent / 100 / totalChapters) * 100);

    updateProgress({
      currentChapter,
      currentPosition: position,
      progress: progressPercent
    }, {
      onSuccess: () => {
        setIsSyncing(false);
        setLastSyncTime(Date.now());
      },
      onError: (error) => {
        setIsSyncing(false);
        setSyncError(error instanceof Error ? error.message : "Ошибка сохранения прогресса");
        setTimeout(() => setSyncError(null), 3000);
      }
    });
  };

  // Обработка скролла с дебаунсингом
  const handleScroll = () => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      saveProgress();
    }, 1000);
  };

  const renderMainContent = () => {
    if (contentLoading && currentChapter != null) {
      return <ChapterLoadingIndicator />;
    }
    if (currentChapterContent) {
      return (
        <>
          <ClubContentRenderer content={currentChapterContent} />
          
          {/* Навигация по главам */}
          {chapters.length > 1 && (
            <div className="flex justify-between items-center mt-12 pt-8 border-t">
              <Button
                variant="outline"
                onClick={() => changeChapter(Math.max(1, (currentChapter ?? 1) - 1))}
                disabled={(currentChapter ?? 1) <= 1}
                className="px-8 py-3 text-base"
              >
                ← Предыдущая
              </Button>
              <span className="text-sm text-muted-foreground">
                Глава {currentChapter ?? 1} из {bookData.totalChapters}
              </span>
              <Button
                variant="outline"
                onClick={() => changeChapter(Math.min(bookData.totalChapters, (currentChapter ?? 1) + 1))}
                disabled={(currentChapter ?? 1) >= bookData.totalChapters}
                className="px-8 py-3 text-base"
              >
                Следующая →
              </Button>
            </div>
          )}
          {currentChapter !== null && currentChapter === bookData.totalChapters && (
            <div className="mt-6 flex justify-end">
              <Button
                variant="default"
                onClick={() => {
                  const container = scrollContainerRef.current;
                  const scrollTop = container?.scrollTop ?? 0;
                  const scrollHeight = container?.scrollHeight ?? 0;
                  const clientHeight = container?.clientHeight ?? 0;
                  const position = JSON.stringify({ scrollTop, scrollHeight, clientHeight });
                  updateProgress({
                    currentChapter,
                    currentPosition: position,
                    progress: 100,
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
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Верхняя панель */}
      <section className="border-b bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => globalThis.history.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">{bookData.title}</h1>
              <p className="text-sm text-muted-foreground">Клубное чтение</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTocOpen(!tocOpen)}
            >
              <List className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Настройки чтения"
            >
              <Settings className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHelpOpen(true)}
              title="Горячие клавиши"
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
            className="bg-background border rounded-lg shadow-xl w-full max-w-md max-h-[80vh] pointer-events-auto mr-4"
          >
            <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Настройки чтения</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="p-4">
              <ClubReaderControls clubId={clubId} bookId={bookId} />
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
            className="bg-background border rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto pointer-events-auto mr-4 flex flex-col"
          >
            <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between flex-none">
              <h2 className="text-lg font-semibold">Оглавление</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTocOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="p-4 flex-1">
              <ClubChapterList
                chapters={chapters}
                currentChapter={currentChapter || 1}
                onChapterSelect={(chapter) => {
                  setCurrentChapter(chapter);
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
            className="bg-background border rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto pointer-events-auto mr-4 flex flex-col"
          >
            <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between flex-none">
              <h2 className="text-lg font-semibold">Закладки</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBookmarksOpen(false)}
              >
                ✕
              </Button>
            </div>
            <div className="p-4 flex-1">
              {bookmarksLoading ? (
                <LoadingIndicator message="Загрузка закладок..." />
              ) : (
                <BookmarksPanel
                  bookId={bookId}
                  bookmarks={bookmarks}
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
              className="p-8"
              style={{
                fontFamily: 'var(--club-reader-font-family, inherit)',
                fontSize: `${fontSize}px`,
                lineHeight: 'var(--club-reader-line-height, 1.6)',
                maxWidth: 'var(--club-reader-content-width, 800px)',
                margin: '0 auto'
              } as React.CSSProperties}
            >
              {renderMainContent()}
            </div>
          </div>
        </main>
      </div>

      {/* Компактный индикатор синхронизации */}
      <CompactSyncIndicator
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime || undefined}
        error={syncError || undefined}
      />

      {/* Компактная панель прогресса */}
      {progress && (
        <section 
          ref={progressContainerRef}
          className={`fixed left-4 bottom-4 bg-card/60 backdrop-blur-sm border rounded-lg shadow-lg transition-opacity duration-500 ${
            progressVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ 
            width: '280px',
            zIndex: 1000
          }}
          onMouseEnter={() => {
            setProgressVisible(true);
            if (progressTimeoutRef.current) {
              clearTimeout(progressTimeoutRef.current);
            }
          }}
          onMouseLeave={() => {
            progressTimeoutRef.current = setTimeout(() => {
              setProgressVisible(false);
            }, 2000);
          }}
          aria-label="Панель прогресса клуба"
          >
          <div className="p-3 space-y-2">
            {/* Ваш прогресс */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Вы</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-green-600">{progress?.userProgress?.progress || 0}%</span>
                <span className="text-xs text-muted-foreground">Гл.{progress?.userProgress?.currentChapter || 1}</span>
              </div>
            </div>
            <div className="bg-muted rounded-full h-1.5">
              <div 
                className="bg-green-600 h-1.5 rounded-full transition-all"
                style={{ width: `${progress?.userProgress?.progress || 0}%` }}
              />
            </div>
            
            {/* Клубный прогресс */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Клуб</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-blue-600">{progress?.clubProgress?.progress || 0}%</span>
                <span className="text-xs text-muted-foreground">Гл.{progress?.clubProgress?.currentChapter || 1}</span>
              </div>
            </div>
            <div className="bg-muted rounded-full h-1.5">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all"
                style={{ width: `${progress?.clubProgress?.progress || 0}%` }}
              />
            </div>
          </div>
          
        </section>
      )}

      {/* Справка по горячим клавишам */}
      <KeyboardHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
