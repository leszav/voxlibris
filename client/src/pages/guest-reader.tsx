import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { useGuest } from "@/hooks/use-guest";

function handleGoBack() {
  globalThis.location.href = "/guest/library";
}

export default function GuestReader() {
  const {
    book,
    position,
    savePosition,
    refreshBook,
    refreshPosition,
    trackEvent,
    isBookExpired
  } = useGuest();

  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState(0);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced save position
  const debouncedSave = useCallback((progress: number) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      setIsSaving(true);
      savePosition(progress)
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
    setScrollProgress(progress);

    debouncedSave(progress);
  }, [debouncedSave]);

  const restorePosition = useCallback(() => {
    if (!contentRef.current || !position?.currentPosition) return;

    const savedPosition = position.currentPosition as { scrollTop?: number };
    if (savedPosition?.scrollTop !== undefined) {
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = savedPosition.scrollTop || 0;
        }
      }, 100);
    }
  }, [position]);

  useEffect(() => {
    // Initial load
    refreshBook().then(() => {
      refreshPosition().then(() => {
        // Restore scroll position after book is loaded
        restorePosition();
      });
    });

    // Track session start
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);
    setSessionStartTime(Date.now());
    trackEvent("session_start", newSessionId);

    // Cleanup on unmount
    return () => {
      // Track session end
      if (sessionId && sessionStartTime > 0) {
        const duration = Math.round((Date.now() - sessionStartTime) / 60000);
        trackEvent("session_end", sessionId, { duration });
      }

      // Final save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (contentRef.current) {
        savePosition(scrollProgress, { scrollTop: contentRef.current.scrollTop });
      }
    };
  }, []);

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

          <div className="text-sm text-muted-foreground">
            {scrollProgress}%
            {isSaving && <span className="ml-1">💾</span>}
          </div>
        </div>

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
      >
        <article className="container max-w-2xl mx-auto px-6 py-8">
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
            className="prose prose-lg max-w-none dark:prose-invert"
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
