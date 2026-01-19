import { useCallback, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from './use-auth';

const YANDEX_METRIKA_ID = 106167747;

export type AnalyticsEventType = 
  | 'book_open'
  | 'chapter_start'
  | 'chapter_complete'
  | 'reading_session'
  | 'bookmark_create'
  | 'note_create'
  | 'book_complete'
  | 'club_join'
  | 'club_leave'
  | 'book_upload';

interface AnalyticsEventData {
  eventType: AnalyticsEventType;
  bookId?: string;
  clubId?: string;
  chapterNumber?: number;
  duration?: number;
  progress?: number;
  metadata?: Record<string, any>;
}

interface ReadingSessionTracker {
  bookId: string;
  chapterNumber: number;
  startTime: number;
}

/**
 * Хук для отправки событий аналитики
 * Автоматически отправляет события в собственную систему и Yandex.Metrika
 */
export function useAnalytics() {
  const { user } = useAuth();
  const sessionTracker = useRef<ReadingSessionTracker | null>(null);
  const sessionInterval = useRef<NodeJS.Timeout | null>(null);

  // Отправка события в Yandex.Metrika
  const sendToMetrika = useCallback((eventType: AnalyticsEventType, params?: Record<string, any>) => {
    if (typeof globalThis !== 'undefined' && (globalThis as any).ym) {
      try {
        (globalThis as any).ym(YANDEX_METRIKA_ID, 'reachGoal', eventType, {
          ...params,
          user_id: user?.id,
        });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[Analytics] Yandex.Metrika error:', error);
        }
      }
    }
  }, [user]);

  // Мутация для отправки одного события
  const { mutate: trackEvent } = useMutation({
    mutationFn: async (data: AnalyticsEventData) => {
      console.log('[Analytics] Отправка события:', data);
      
      try {
        // Отправляем в собственную систему
        const response = await apiRequest('/api/v1/analytics/event', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        
        console.log('[Analytics] Событие успешно отправлено:', response);

        // Отправляем в Yandex.Metrika
        sendToMetrika(data.eventType, {
          book_id: data.bookId,
          club_id: data.clubId,
          chapter: data.chapterNumber,
          duration: data.duration,
          progress: data.progress,
          ...data.metadata,
        });

        return response;
      } catch (error) {
        console.error('[Analytics] Ошибка при отправке события:', error);
        throw error;
      }
    },
    onError: (error) => {
      console.error('[Analytics] Failed to track event:', error);
    },
    onSuccess: (data, variables) => {
      console.log('[Analytics] Событие обработано успешно:', variables.eventType);
    },
  });

  // Открытие книги
  const trackBookOpen = useCallback((bookId: string, metadata?: Record<string, any>) => {
    trackEvent({
      eventType: 'book_open',
      bookId,
      metadata,
    });
  }, [trackEvent]);

  // Начало чтения главы
  const trackChapterStart = useCallback((bookId: string, chapterNumber: number) => {
    trackEvent({
      eventType: 'chapter_start',
      bookId,
      chapterNumber,
    });
  }, [trackEvent]);

  // Завершение главы
  const trackChapterComplete = useCallback((bookId: string, chapterNumber: number, duration?: number) => {
    trackEvent({
      eventType: 'chapter_complete',
      bookId,
      chapterNumber,
      duration,
    });
  }, [trackEvent]);

  // Завершение книги
  const trackBookComplete = useCallback((bookId: string) => {
    trackEvent({
      eventType: 'book_complete',
      bookId,
    });
  }, [trackEvent]);

  // Создание закладки
  const trackBookmarkCreate = useCallback((bookId: string, chapterNumber: number) => {
    trackEvent({
      eventType: 'bookmark_create',
      bookId,
      chapterNumber,
    });
  }, [trackEvent]);

  // Создание заметки
  const trackNoteCreate = useCallback((bookId: string, chapterNumber: number) => {
    trackEvent({
      eventType: 'note_create',
      bookId,
      chapterNumber,
    });
  }, [trackEvent]);

  // Вступление в клуб
  const trackClubJoin = useCallback((clubId: string) => {
    trackEvent({
      eventType: 'club_join',
      clubId,
    });
  }, [trackEvent]);

  // Выход из клуба
  const trackClubLeave = useCallback((clubId: string) => {
    trackEvent({
      eventType: 'club_leave',
      clubId,
    });
  }, [trackEvent]);

  // Загрузка книги
  const trackBookUpload = useCallback((bookId: string, metadata?: Record<string, any>) => {
    trackEvent({
      eventType: 'book_upload',
      bookId,
      metadata,
    });
  }, [trackEvent]);

  // Начало отслеживания сессии чтения
  const startReadingSession = useCallback((bookId: string, chapterNumber: number) => {
    // Остановить предыдущую сессию если есть
    if (sessionInterval.current) {
      clearInterval(sessionInterval.current);
    }

    sessionTracker.current = {
      bookId,
      chapterNumber,
      startTime: Date.now(),
    };

    // Отправлять событие каждые 30 секунд
    sessionInterval.current = setInterval(() => {
      if (sessionTracker.current) {
        const duration = Math.floor((Date.now() - sessionTracker.current.startTime) / 1000);
        trackEvent({
          eventType: 'reading_session',
          bookId: sessionTracker.current.bookId,
          chapterNumber: sessionTracker.current.chapterNumber,
          duration,
        });
      }
    }, 30000); // 30 секунд
  }, [trackEvent]);

  // Остановка отслеживания сессии
  const stopReadingSession = useCallback(() => {
    if (sessionInterval.current) {
      clearInterval(sessionInterval.current);
      sessionInterval.current = null;
    }

    // Отправить финальное событие сессии
    if (sessionTracker.current) {
      const duration = Math.floor((Date.now() - sessionTracker.current.startTime) / 1000);
      trackEvent({
        eventType: 'reading_session',
        bookId: sessionTracker.current.bookId,
        chapterNumber: sessionTracker.current.chapterNumber,
        duration,
      });
      sessionTracker.current = null;
    }
  }, [trackEvent]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (sessionInterval.current) {
        clearInterval(sessionInterval.current);
      }
    };
  }, []);

  // Автоматический трекинг просмотров страниц для SPA
  useEffect(() => {
    const trackPageView = () => {
      if (typeof globalThis !== 'undefined' && (globalThis as any).ym) {
        try {
          (globalThis as any).ym(YANDEX_METRIKA_ID, 'hit', globalThis.location.href, {
            title: document.title,
            referer: document.referrer,
          });
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('[Analytics] Page view tracking error:', error);
          }
        }
      }
    };

    // Трекаем первый просмотр
    trackPageView();

    // Слушаем изменения истории для SPA навигации
    const handlePopState = () => trackPageView();
    globalThis.addEventListener('popstate', handlePopState as EventListener);

    // Перехватываем pushState и replaceState для React Router
    const originalPushState = globalThis.history.pushState;
    const originalReplaceState = globalThis.history.replaceState;

    globalThis.history.pushState = function(...args: any[]) {
      (originalPushState as any).apply(globalThis.history, args);
      trackPageView();
    };

    globalThis.history.replaceState = function(...args: any[]) {
      (originalReplaceState as any).apply(globalThis.history, args);
      trackPageView();
    };

    return () => {
      globalThis.removeEventListener('popstate', handlePopState as EventListener);
      globalThis.history.pushState = originalPushState;
      globalThis.history.replaceState = originalReplaceState;
    };
  }, []);

  return {
    trackBookOpen,
    trackChapterStart,
    trackChapterComplete,
    trackBookComplete,
    trackBookmarkCreate,
    trackNoteCreate,
    trackClubJoin,
    trackClubLeave,
    trackBookUpload,
    startReadingSession,
    stopReadingSession,
  };
}
