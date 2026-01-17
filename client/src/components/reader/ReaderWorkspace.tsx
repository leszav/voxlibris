import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useBookContent, useReadingProgress, useUpdateProgress } from "../../hooks/use-reader";
import { useAnalytics } from "../../hooks/use-analytics";
import { ContentRenderer } from "./ContentRenderer";
import { ReaderControls } from "./ReaderControls";
import { Button } from "../ui/button";
import { Maximize2, Minimize2, List, Settings, ArrowLeft } from "lucide-react";

interface Chapter {
  chapterNumber: number;
  title?: string;
  content?: string;
}

interface BookData {
  id?: string;
  title: string;
  chapters?: Chapter[];
  content?: string;
  isPersonalBook?: boolean;
}

interface ReaderWorkspaceProps {
  bookId?: string;
  clubId?: string;
  params?: {
    bookId?: string;
  };
}

function initializeReaderChapter(
  bookId: string | undefined,
  progress: { currentChapter: number } | null | undefined,
  currentChapter: number | null,
  setCurrentChapter: (chapter: number) => void,
  progressLoading: boolean
) {
  if (!progressLoading && progress && currentChapter === null) {
    setCurrentChapter(progress.currentChapter || 1);
  } else if (!progressLoading && !progress && currentChapter === null) {
    setCurrentChapter(1);
  }
}

export function ReaderWorkspace({ bookId: propBookId, clubId, params }: Readonly<ReaderWorkspaceProps>) {
  const routeParams = useParams();
  const bookId = propBookId || params?.bookId || routeParams.bookId;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentChapter, setCurrentChapter] = useState<number | null>(null); // null пока не загрузится progress
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progressRestored, setProgressRestored] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedProgressRef = useRef<{chapter: number, position: string, progress: number} | null>(null);

  // Загрузка прогресса (пока используем тот же API для всех книг)
  const { data: progress, isLoading: progressLoading } = useReadingProgress(bookId!);
  
  // Загрузка контента (только после получения прогресса)
  const { data: content, isLoading: contentLoading } = useBookContent(
    bookId!,
    currentChapter || 1,
    currentChapter !== null // загружаем контент только после определения главы
  );
  const { mutate: updateProgress } = useUpdateProgress(bookId!);
  
  // Analytics hooks
  const analytics = useAnalytics();
  
  // Инициализация currentChapter из прогресса при первой загрузке
  useEffect(() => {
    initializeReaderChapter(bookId, progress, currentChapter, setCurrentChapter, progressLoading);
  }, [progress, progressLoading, currentChapter, bookId]);

  // Адаптация данных в зависимости от источника (personalBooks или books)
  const bookData = content && 'book' in content 
    ? {
        title: content.book.title,
        chapters: content.book.chapters,
        totalChapters: content.book.chapters?.length || 1,
        isPersonalBook: true
      }
    : {
        title: (content as any)?.title || "Загрузка...",
        content: (content as any)?.content || "",
        totalChapters: 1,
        isPersonalBook: false
      };

  // Получаем текущую главу в зависимости от типа книги
  const currentChapterContent = bookData.isPersonalBook && bookData.chapters
    ? bookData.chapters.find(ch => ch.chapterNumber === currentChapter)?.content || ""
    : bookData.content || "";

  // Применение сохранённых настроек ридера при загрузке
  useEffect(() => {
    const saved = localStorage.getItem("readerSettings");
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        const root = document.documentElement;
        root.style.setProperty("--reader-font-size", `${settings.fontSize}px`);
        root.style.setProperty("--reader-font-family", settings.fontFamily);
        root.style.setProperty("--reader-line-height", settings.lineHeight.toString());
        root.style.setProperty("--reader-text-align", settings.textAlign);
        root.style.setProperty("--reader-content-width", `${settings.contentWidth}%`);
        (root.dataset as any).readerTheme = settings.theme;
        document.body.classList.remove("reader-light", "reader-dark", "reader-sepia");
        document.body.classList.add(`reader-${settings.theme}`);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error('Ошибка применения настроек:', e);
        }
      }
    }
  }, []);

  // Трекинг открытия книги и начала чтения главы
  useEffect(() => {
    if (bookId && currentChapter !== null && !contentLoading) {
      // Отслеживаем открытие книги только один раз
      if (currentChapter === 1 || currentChapter === progress?.currentChapter) {
        analytics.trackBookOpen(bookId);
      }
      
      // Отслеживаем начало чтения главы
      analytics.trackChapterStart(bookId, currentChapter);
      
      // Запускаем отслеживание сессии чтения
      analytics.startReadingSession(bookId, currentChapter);
      
      return () => {
        // Останавливаем отслеживание при размонтировании или смене главы
        analytics.stopReadingSession();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, currentChapter, contentLoading]);

  // Восстановление позиции из прогресса (только один раз при загрузке)
  useEffect(() => {
    // Восстанавливаем позицию только если:
    // 1. Прогресс загружен
    // 2. Текущая глава совпадает с главой из прогресса
    // 3. Контент загружен
    // 4. Ещё не восстанавливали позицию
    if (
      progress && 
      !contentLoading && 
      !progressRestored && 
      currentChapter === progress.currentChapter &&
      currentChapter !== null
    ) {
      if (import.meta.env.DEV) {
        console.log('[Reader] Restoring scroll position from progress:', progress);
      }
      
      // Восстановление позиции скролла после загрузки контента
      if (progress.currentPosition && scrollContainerRef.current) {
        try {
          const position = JSON.parse(progress.currentPosition);
          // Даём время на рендеринг контента
          setTimeout(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = position.scrollTop || 0;
              if (import.meta.env.DEV) {
                console.log('[Reader] Restored scroll position:', position.scrollTop);
              }
            }
          }, 300);
        } catch (e) {
          if (import.meta.env.DEV) {
            console.error('Ошибка восстановления позиции скролла:', e);
          }
        }
      }
      setProgressRestored(true);
    }
  }, [progress, contentLoading, progressRestored, currentChapter]);

  // Отслеживание скролла и сохранение прогресса
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !bookData || bookData.totalChapters === 0 || currentChapter === null) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      // Вычисление прогресса скролла в текущей главе
      const scrollProgress = Math.min(
        100,
        Math.round((scrollTop / Math.max(1, scrollHeight - clientHeight)) * 100)
      );

      // Общий прогресс по всей книге
      const totalProgress = Math.round(
        ((currentChapter - 1) / bookData.totalChapters + scrollProgress / 100 / bookData.totalChapters) * 100
      );

      // Debounce - сохраняем только через 1.5 секунды после остановки скролла
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        const position = JSON.stringify({ scrollTop, scrollHeight, clientHeight });
        if (import.meta.env.DEV) {
          console.log('[Reader] Saving progress:', { currentChapter, totalProgress, position });
        }
        
        // Сохраняем последний прогресс в ref
        lastSavedProgressRef.current = {
          chapter: currentChapter,
          position,
          progress: totalProgress
        };
        
        updateProgress({
          currentChapter,
          currentPosition: position,
          progress: totalProgress,
          clubId,
        });
      }, 1500);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [currentChapter, bookData, updateProgress, clubId]);

  // Сохранение прогресса при выходе из компонента (размонтировании)
  useEffect(() => {
    return () => {
      // Если есть несохранённый прогресс, сохраняем его немедленно
      const container = scrollContainerRef.current;
      if (container && bookData && bookData.totalChapters > 0 && currentChapter !== null) {
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        
        const scrollProgress = Math.min(
          100,
          Math.round((scrollTop / Math.max(1, scrollHeight - clientHeight)) * 100)
        );
        
        const totalProgress = Math.round(
          ((currentChapter - 1) / bookData.totalChapters + scrollProgress / 100 / bookData.totalChapters) * 100
        );
        
        const position = JSON.stringify({ scrollTop, scrollHeight, clientHeight });
        
        if (import.meta.env.DEV) {
          console.log('[Reader] Saving progress on unmount:', { currentChapter, totalProgress });
        }
        
        // Сохраняем синхронно через fetch, так как компонент размонтируется
        const token = localStorage.getItem('authToken');
        if (token && bookId) {
          fetch('/api/progress', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              bookId,
              currentChapter,
              currentPosition: position,
              progress: totalProgress,
              clubId,
            }),
            keepalive: true, // Позволяет завершить запрос даже после закрытия страницы
          });
        }
      }
    };
  }, [bookId, currentChapter, bookData, clubId]);

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

  // Рендер контента без вложенных тернариев
  const renderMainContent = () => {
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
          <div className="flex justify-between items-center mt-12 pt-8 border-t">
            <Button
              variant="outline"
              onClick={() => setCurrentChapter(Math.max(1, chapter - 1))}
              disabled={chapter <= 1}
            >
              ← Предыдущая глава
            </Button>
            <span className="text-sm text-muted-foreground">
              Глава {chapter} из {bookData.totalChapters}
            </span>
            <Button
              variant="outline"
              onClick={() => setCurrentChapter(Math.min(bookData.totalChapters, chapter + 1))}
              disabled={chapter >= bookData.totalChapters}
            >
              Следующая глава →
            </Button>
          </div>
        </>
      );
    }
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Контент не найден</p>
      </div>
    );
  };

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
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="border-b bg-background relative z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            {/* Возврат в библиотеку */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (globalThis.location.href = '/library')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Библиотека
            </Button>

            {/* Оглавление */}
            <div className="relative">
              <Button
                variant={tocOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  setTocOpen(!tocOpen);
                  setSettingsOpen(false);
                }}
              >
                <List className="w-4 h-4 mr-2" />
                Оглавление
              </Button>
              {tocOpen && (
                <div className="absolute left-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-background text-foreground border rounded-md shadow-lg p-4 z-50">
                  <h3 className="font-semibold text-lg mb-4">Оглавление</h3>
                  <div className="space-y-2">
                    {bookData.isPersonalBook && bookData.chapters ? (
                      bookData.chapters.map((chapter: Chapter) => (
                        <Button
                          key={chapter.chapterNumber}
                          variant={currentChapter === chapter.chapterNumber ? "secondary" : "ghost"}
                          className="w-full justify-start"
                          onClick={() => {
                            setCurrentChapter(chapter.chapterNumber);
                            setTocOpen(false);
                          }}
                        >
                          {chapter.title || `Глава ${chapter.chapterNumber}`}
                        </Button>
                      ))
                    ) : (
                      <Button
                        variant={currentChapter === 1 ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => {
                          setCurrentChapter(1);
                          setTocOpen(false);
                        }}
                      >
                        Глава 1
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Правая часть - информация о книге и действия */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <h1 className="text-lg font-semibold">
                {bookData.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {bookData.isPersonalBook && bookData.chapters 
                  ? bookData.chapters.find((ch: Chapter) => ch.chapterNumber === currentChapter)?.title || `Глава ${currentChapter}`
                  : `Глава ${currentChapter}`}
              </p>
            </div>

            {/* Настройки */}
            <div className="relative">
              <Button
                variant={settingsOpen ? "secondary" : "ghost"}
                size="icon"
                onClick={() => {
                  setSettingsOpen(!settingsOpen);
                  setTocOpen(false);
                }}
                title="Настройки чтения"
              >
                <Settings className="w-5 h-5" />
              </Button>
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-background text-foreground border rounded-md shadow-lg p-4 z-50">
                  <ReaderControls bookId={bookId} />
                </div>
              )}
            </div>

            {/* Полноэкранный режим */}
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

      {/* Main Content Area */}
      <main ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-background text-foreground">
        <div 
          className="mx-auto px-8 py-12"
          style={{
            width: "var(--reader-content-width, 80%)"
          }}
        >
          {renderMainContent()}
        </div>
      </main>
    </div>
  );
}
