import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useReaderPanelsAutoclose } from "@/components/reader/core/use-reader-panels-autoclose";
import { usePreserveReaderVisualAnchor } from "@/components/reader/core/use-preserve-reader-visual-anchor";
import { Button } from "@/components/ui/button";
import { useGuest } from "@/hooks/use-guest";
import { DEFAULT_READER_SETTINGS, getEffectiveReaderSettings } from "@/lib/reader-settings";

type GuestReaderTheme = "light" | "dark";
type GuestReaderFontFamily = "Georgia" | "Arial" | "system-ui";

interface GuestReaderSettings {
  fontSize: number;
  fontFamily: GuestReaderFontFamily;
  contentWidth: 72 | 82 | 92;
  theme: GuestReaderTheme;
}

const GUEST_READER_SETTINGS_KEY = "guestReaderSettings_v1";
const DEFAULT_GUEST_READER_SETTINGS: GuestReaderSettings = {
  fontSize: 18,
  fontFamily: "Georgia",
  contentWidth: 82,
  theme: "light",
};

function isGuestReaderTheme(value: unknown): value is GuestReaderTheme {
  return value === "light" || value === "dark";
}

function isGuestReaderFontFamily(value: unknown): value is GuestReaderFontFamily {
  return value === "Georgia" || value === "Arial" || value === "system-ui";
}

function isGuestReaderContentWidth(value: unknown): value is 72 | 82 | 92 {
  return value === 72 || value === 82 || value === 92;
}

function loadGuestReaderSettings(): GuestReaderSettings {
  try {
    const savedRaw = localStorage.getItem(GUEST_READER_SETTINGS_KEY);
    if (!savedRaw) {
      return DEFAULT_GUEST_READER_SETTINGS;
    }

    const parsed = JSON.parse(savedRaw) as Partial<GuestReaderSettings>;
    return {
      fontSize:
        typeof parsed.fontSize === "number" && parsed.fontSize >= 12 && parsed.fontSize <= 28
          ? parsed.fontSize
          : DEFAULT_GUEST_READER_SETTINGS.fontSize,
      fontFamily: isGuestReaderFontFamily(parsed.fontFamily)
        ? parsed.fontFamily
        : DEFAULT_GUEST_READER_SETTINGS.fontFamily,
      contentWidth: isGuestReaderContentWidth(parsed.contentWidth)
        ? parsed.contentWidth
        : DEFAULT_GUEST_READER_SETTINGS.contentWidth,
      theme: isGuestReaderTheme(parsed.theme) ? parsed.theme : DEFAULT_GUEST_READER_SETTINGS.theme,
    };
  } catch {
    return DEFAULT_GUEST_READER_SETTINGS;
  }
}

function handleGoBack() {
  globalThis.location.href = "/guest/library";
}

export default function GuestReader() {
  const {
    isLoading,
    book,
    position,
    savePosition,
    refreshBook,
    refreshPosition,
    trackEvent,
    isBookExpired
  } = useGuest();

  const contentRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLElement>(null);
  const scrollProgressRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartTimeRef = useRef(0);
  const hasRestoredPositionRef = useRef(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [readerSettings, setReaderSettings] = useState<GuestReaderSettings>(() => loadGuestReaderSettings());
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth
  );

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveReaderSettings = React.useMemo(
    () => getEffectiveReaderSettings({
      ...DEFAULT_READER_SETTINGS,
      fontSize: readerSettings.fontSize,
      fontFamily: readerSettings.fontFamily,
      theme: readerSettings.theme,
      contentWidth: readerSettings.contentWidth,
    }, viewportWidth),
    [readerSettings, viewportWidth]
  );
  const preserveReaderVisualAnchor = usePreserveReaderVisualAnchor({
    scrollContainerRef: contentRef as React.RefObject<HTMLElement | null>,
    contentAreaRef: contentAreaRef as React.RefObject<HTMLElement | null>,
  });

  useReaderPanelsAutoclose({
    isOpen: showSettings,
    onClose: () => setShowSettings(false),
    contentRef: contentRef as React.RefObject<HTMLElement | null>,
  });

  useEffect(() => {
    localStorage.setItem(GUEST_READER_SETTINGS_KEY, JSON.stringify(readerSettings));
  }, [readerSettings]);

  useEffect(() => {
    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", updateViewportWidth);
    window.addEventListener("orientationchange", updateViewportWidth);

    return () => {
      window.removeEventListener("resize", updateViewportWidth);
      window.removeEventListener("orientationchange", updateViewportWidth);
    };
  }, []);

  useEffect(() => {
    const body = document.body;
    body.classList.remove("reader-light", "reader-dark");
    body.classList.add(`reader-${readerSettings.theme}`);

    return () => {
      body.classList.remove("reader-light", "reader-dark");
    };
  }, [readerSettings.theme]);

  const updateFontSize = useCallback((delta: number) => {
    preserveReaderVisualAnchor(() => {
      setReaderSettings((prev) => ({
        ...prev,
        fontSize: Math.min(28, Math.max(12, prev.fontSize + delta)),
      }));
    });
  }, [preserveReaderVisualAnchor]);

  const updateReaderSettingsWithAnchor = useCallback((updater: (previous: GuestReaderSettings) => GuestReaderSettings) => {
    preserveReaderVisualAnchor(() => {
      setReaderSettings((prev) => updater(prev));
    });
  }, [preserveReaderVisualAnchor]);

  // Debounced save position
  const debouncedSave = useCallback((progress: number, currentScrollTop: number) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      setIsSaving(true);
      savePosition(progress, { scrollTop: currentScrollTop })
        .finally(() => {
          setIsSaving(false);
        });
    }, 1000);
  }, [savePosition]);

  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;

    const el = contentRef.current;
    const scrollTop = el.scrollTop;
    const scrollHeight = el.scrollHeight - el.clientHeight;

    if (scrollHeight <= 0) return;

    const progress = Math.round((scrollTop / scrollHeight) * 100);
    scrollProgressRef.current = progress;
    setScrollProgress(progress);

    debouncedSave(progress, scrollTop);
  }, [debouncedSave]);

  useEffect(() => {
    // Initial load
    refreshBook().then(() => {
      void refreshPosition();
    });

    // Track session start
    const newSessionId = crypto.randomUUID();
    sessionIdRef.current = newSessionId;
    sessionStartTimeRef.current = Date.now();
    trackEvent("session_start", newSessionId);

    // Cleanup on unmount
    return () => {
      // Track session end
      const currentSessionId = sessionIdRef.current;
      const currentSessionStart = sessionStartTimeRef.current;
      if (currentSessionId && currentSessionStart > 0) {
        const duration = Math.round((Date.now() - currentSessionStart) / 60000);
        trackEvent("session_end", currentSessionId, { duration });
      }

      // Final save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (contentRef.current) {
        savePosition(scrollProgressRef.current, { scrollTop: contentRef.current.scrollTop });
      }
    };
  }, [refreshBook, refreshPosition, savePosition, trackEvent]);

  useEffect(() => {
    if (!book || !position || !contentRef.current || hasRestoredPositionRef.current) {
      return;
    }

    const savedPosition = position.currentPosition as { scrollTop?: number } | undefined;
    const hasSavedScrollTop = typeof savedPosition?.scrollTop === "number";
    const savedProgress = typeof position?.progressPercent === "number" ? position.progressPercent : 0;

    const timer = setTimeout(() => {
      if (!contentRef.current) {
        return;
      }

      const el = contentRef.current;
      const maxScrollable = Math.max(el.scrollHeight - el.clientHeight, 0);

      if (hasSavedScrollTop) {
        const targetScrollTop = Math.max(0, Math.min(savedPosition?.scrollTop || 0, maxScrollable));
        el.scrollTop = targetScrollTop;
      } else if (savedProgress > 0 && maxScrollable > 0) {
        el.scrollTop = Math.round((savedProgress / 100) * maxScrollable);
      }

      const actualProgress = maxScrollable > 0 ? Math.round((el.scrollTop / maxScrollable) * 100) : 0;
      scrollProgressRef.current = actualProgress;
      setScrollProgress(actualProgress);
      hasRestoredPositionRef.current = true;
    }, 120);

    return () => {
      clearTimeout(timer);
    };
  }, [book, position]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="container py-8 max-w-2xl mx-auto text-center">
          <p className="text-muted-foreground">Загрузка книги...</p>
        </div>
      </MainLayout>
    );
  }

  if (isBookExpired) {
    return (
      <MainLayout>
        <div className="container py-8 max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Срок действия истек</h1>
          <p className="text-muted-foreground mb-6">
            Срок действия вашей гостевой книги истек
          </p>
          <Button onClick={handleGoBack}>
            Вернуться в библиотеку
          </Button>
        </div>
      </MainLayout>
    );
  }

  if (!book) {
    return (
      <MainLayout>
        <div className="container py-8 max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Книга не найдена</h1>
          <p className="text-muted-foreground mb-6">
            Загрузите книгу в гостевой библиотеке
          </p>
          <Button onClick={handleGoBack}>
            Перейти в библиотеку
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleGoBack}>
            ← Назад
          </Button>

          <div className="text-center">
            <h1 className="font-medium text-sm truncate max-w-[200px]">
              {book.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              {book.author}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings((prev) => !prev)}
            >
              Aa
            </Button>
            <div className="text-sm text-muted-foreground">
              {scrollProgress}%
              {isSaving && <span className="ml-1">💾</span>}
            </div>
          </div>
        </div>

        {showSettings && (
          <div className="container mx-auto px-4 py-3 border-t bg-card space-y-3">
            {viewportWidth < 768 && (
              <p className="text-xs text-muted-foreground">
                На телефоне применяется минимальный шрифт, минимальный интервал и максимальная ширина текста.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Тема:</span>
              <Button
                variant={readerSettings.theme === "light" ? "secondary" : "outline"}
                size="sm"
                onClick={() => updateReaderSettingsWithAnchor((prev) => ({ ...prev, theme: "light" }))}
              >
                Светлая
              </Button>
              <Button
                variant={readerSettings.theme === "dark" ? "secondary" : "outline"}
                size="sm"
                onClick={() => updateReaderSettingsWithAnchor((prev) => ({ ...prev, theme: "dark" }))}
              >
                Тёмная
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Шрифт:</span>
              <Button
                variant={readerSettings.fontFamily === "Georgia" ? "secondary" : "outline"}
                size="sm"
                onClick={() => updateReaderSettingsWithAnchor((prev) => ({ ...prev, fontFamily: "Georgia" }))}
              >
                Georgia
              </Button>
              <Button
                variant={readerSettings.fontFamily === "Arial" ? "secondary" : "outline"}
                size="sm"
                onClick={() => updateReaderSettingsWithAnchor((prev) => ({ ...prev, fontFamily: "Arial" }))}
              >
                Arial
              </Button>
              <Button
                variant={readerSettings.fontFamily === "system-ui" ? "secondary" : "outline"}
                size="sm"
                onClick={() => updateReaderSettingsWithAnchor((prev) => ({ ...prev, fontFamily: "system-ui" }))}
              >
                Системный
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Размер:</span>
              <Button variant="outline" size="sm" onClick={() => updateFontSize(-1)}>-</Button>
              <span className="text-sm w-10 text-center">{readerSettings.fontSize}px</span>
              <Button variant="outline" size="sm" onClick={() => updateFontSize(1)}>+</Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Поля:</span>
              <Button
                variant={readerSettings.contentWidth === 92 ? "secondary" : "outline"}
                size="sm"
                onClick={() => updateReaderSettingsWithAnchor((prev) => ({ ...prev, contentWidth: 92 }))}
              >
                Узкие
              </Button>
              <Button
                variant={readerSettings.contentWidth === 82 ? "secondary" : "outline"}
                size="sm"
                onClick={() => updateReaderSettingsWithAnchor((prev) => ({ ...prev, contentWidth: 82 }))}
              >
                Средние
              </Button>
              <Button
                variant={readerSettings.contentWidth === 72 ? "secondary" : "outline"}
                size="sm"
                onClick={() => updateReaderSettingsWithAnchor((prev) => ({ ...prev, contentWidth: 72 }))}
              >
                Широкие
              </Button>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className="h-[calc(100vh-120px)] overflow-y-auto"
        onScroll={handleScroll}
        style={{
          backgroundColor: "var(--reader-bg)",
          color: "var(--reader-text)",
        }}
      >
        <article
          ref={contentAreaRef}
          className="mx-auto px-6 py-8 w-full"
          style={{
            maxWidth: `${effectiveReaderSettings.contentWidth}%`,
          }}
        >
          {/* Book title */}
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-serif font-bold mb-2">
              {book.title}
            </h1>
            <p className="text-lg text-muted-foreground">
              {book.author}
            </p>
          </header>

          {/* Content */}
          <div
            className="reader-content max-w-none"
            style={{
              fontSize: `${effectiveReaderSettings.fontSize}px`,
              fontFamily: effectiveReaderSettings.fontFamily,
              lineHeight: effectiveReaderSettings.lineHeight,
            }}
            dangerouslySetInnerHTML={{ __html: book.flatContent?.replaceAll('\n', '<br>') || '' }}
          />

          {/* End marker */}
          <div className="mt-12 text-center text-muted-foreground">
            <p>— Конец —</p>
          </div>
        </article>
      </div>
    </MainLayout>
  );
}
