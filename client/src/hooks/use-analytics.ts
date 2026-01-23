import { useCallback, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from './use-auth';


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
 * Автоматически отправляет события в собственную систему аналитики
 */
export function useAnalytics() {
  const sessionTracker = useRef<ReadingSessionTracker | null>(null);
  const sessionInterval = useRef<NodeJS.Timeout | null>(null);


  // Мутация для отправки одного события
  const { mutate: trackEvent } = useMutation({
    mutationFn: async (data: AnalyticsEventData) => {
      if (import.meta.env.DEV) {
        console.log('[Analytics] Отправка события:', data);
      }
      
      try {
        // Отправляем в собственную систему
        const response = await apiRequest('/api/v1/analytics/event', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        
        if (import.meta.env.DEV) {
          console.log('[Analytics] Событие успешно отправлено:', response);
        }


        return response;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[Analytics] Ошибка при отправке события:', error);
        }
        throw error;
      }
    },
    retry: false,
    onError: (error) => {
      if (import.meta.env.DEV) {
        console.error('[Analytics] Failed to track event:', error);
      }
    },
    onSuccess: (data, variables) => {
      if (import.meta.env.DEV) {
        console.log('[Analytics] Событие обработано успешно:', variables.eventType);
      }
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
