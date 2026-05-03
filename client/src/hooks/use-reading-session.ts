import { useState, useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/token-store';
import { apiRequest } from '@/lib/queryClient';

interface ReadingSessionState {
  sessionId?: string;
  isLive: boolean;
  isPaused: boolean;
  isConnected: boolean;
  listenerCount: number;
  currentChapter: number;
  currentPosition: string;
  elapsedTime: number;
}

interface CreateSessionParams {
  clubId: string;
  bookId: string;
  title: string;
  description?: string;
}

interface SessionJoinedPayload {
  listenerCount: number;
  currentChapter: number;
  currentPosition: string;
  isLive: boolean;
  isPaused: boolean;
}

export function useReadingSession(enabled: boolean = true) {
  const { user } = useAuth();
  const [session, setSession] = useState<ReadingSessionState>({
    isLive: false,
    isPaused: false,
    isConnected: false,
    listenerCount: 0,
    currentChapter: 1,
    currentPosition: '0:0',
    elapsedTime: 0
  });
  
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const listenerPollRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<ReadingSessionState>(session);
  const activeSegmentStartedAtRef = useRef<number | null>(null);
  const accumulatedElapsedMsRef = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const syncElapsedTime = (nowMs: number = Date.now()) => {
    const activeSegmentMs = activeSegmentStartedAtRef.current === null
      ? 0
      : Math.max(0, nowMs - activeSegmentStartedAtRef.current);
    const totalElapsedSeconds = Math.floor((accumulatedElapsedMsRef.current + activeSegmentMs) / 1000);
    setSession(prev => ({ ...prev, elapsedTime: totalElapsedSeconds }));
  };

  // Initialize WebSocket connection
  useEffect(() => {
    if (!enabled || !user) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (listenerPollRef.current) {
        clearInterval(listenerPollRef.current);
        listenerPollRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSession(prev => ({ ...prev, isConnected: false }));
      return;
    }

    const socket = io(globalThis.location.origin, {
      withCredentials: true,
      auth: (cb) => {
        const token = getAccessToken();
        cb(token ? { token } : {});
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (import.meta.env.DEV) {
        console.warn('WebSocket connected');
      }
      setSession(prev => ({ ...prev, isConnected: true }));

      // Если сессия уже создана до подключения сокета, присоединяемся при первом connect.
      if (sessionRef.current.sessionId) {
        socket.emit('join_session', sessionRef.current.sessionId);
      }
    });

    socket.on('disconnect', () => {
      if (import.meta.env.DEV) {
        console.warn('WebSocket disconnected');
      }
      // Icecast-стрим независим от WS-соединения — не сбрасываем isLive/isPaused.
      // Таймер останавливаем: без WS неизвестно жив ли стрим.
      stopTimer();
      setSession(prev => ({ ...prev, isConnected: false }));
    });

    socket.on('session_joined', (data: SessionJoinedPayload) => {
      if (import.meta.env.DEV) {
        console.warn('Successfully joined session:', data);
      }
      setSession(prev => ({
        ...prev,
        isConnected: true,
        listenerCount: data.listenerCount,
        currentChapter: data.currentChapter,
        currentPosition: data.currentPosition,
        isLive: data.isLive,
        isPaused: data.isPaused,
      }));
      // Если сессия уже в эфире (реконнект), запускаем таймер
      if (data.isLive && !data.isPaused) {
        startTimer();
      }
    });

    socket.on('session_started', () => {
      setSession(prev => ({ ...prev, isLive: true, isPaused: false }));
      startTimer();
    });

    socket.on('listener_update', () => {
      // Update listener count when someone joins/leaves
      fetchListenerCount();
    });

    socket.on('session_ended', () => {
      setSession(prev => ({ ...prev, isLive: false }));
      stopTimer();
    });

    socket.on('error', (error) => {
      if (import.meta.env.DEV) {
        console.error('WebSocket error:', error);
      }
    });

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (listenerPollRef.current) {
        clearInterval(listenerPollRef.current);
        listenerPollRef.current = null;
      }
      socket.disconnect();
    };
  }, [enabled, user]);

  // Timer for elapsed time
  const startTimer = () => {
    activeSegmentStartedAtRef.current ??= Date.now();

    syncElapsedTime();

    if (timerRef.current) return;

    timerRef.current = setInterval(() => {
      syncElapsedTime();
    }, 1000);
  };

  const stopTimer = () => {
    if (activeSegmentStartedAtRef.current !== null) {
      accumulatedElapsedMsRef.current += Math.max(0, Date.now() - activeSegmentStartedAtRef.current);
      activeSegmentStartedAtRef.current = null;
    }

    syncElapsedTime();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Create new reading session
  const createSession = async (params: CreateSessionParams): Promise<string> => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error('Failed to create reading session');
      }

      const data = await response.json();
      const sessionId = data.session.id;
      
      setSession(prev => ({
        ...prev,
        sessionId,
        currentChapter: 1,
        currentPosition: '0:0',
        elapsedTime: 0
      }));
      accumulatedElapsedMsRef.current = 0;
      activeSegmentStartedAtRef.current = null;
      
      // Join the WebSocket session after creation
      if (socketRef.current?.connected) {
        if (import.meta.env.DEV) {
          console.warn('Joining WebSocket session:', sessionId);
        }
        socketRef.current.emit('join_session', sessionId);
      }
      
      return sessionId;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error creating session:', error);
      }
      throw error;
    }
  };

  // Start live reading
  const startReading = async () => {
    if (!session.sessionId || !socketRef.current) {
      if (import.meta.env.DEV) {
        console.error('Cannot start reading: missing sessionId or socket connection');
      }
      return;
    }

    if (import.meta.env.DEV) {
      console.warn('Starting reading session:', session.sessionId);
    }

    // Устанавливаем isLive=true в БД.
    // Состояние обновляем локально сразу после успешного HTTP-ответа —
    // не ждём WS session_started, т.к. сокет может быть временно разорван.
    // WS-событие придёт позже и будет идемпотентно (без сайд-эффектов).
    const token = getAccessToken();
    try {
      const resp = await fetch(`/api/sessions/${session.sessionId}/start`, {
        method: 'PUT',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (resp.ok) {
        accumulatedElapsedMsRef.current = 0;
        activeSegmentStartedAtRef.current = null;
        setSession(prev => ({ ...prev, isLive: true, isPaused: false }));
        startTimer();
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to mark session as live in DB:', err);
      }
    }
  };

  // Pause reading
  const pauseReading = () => {
    stopTimer();
    setSession(prev => ({ 
      ...prev, 
      isPaused: true 
    }));
  };

  // Resume reading
  const resumeReading = () => {
    startTimer();
    setSession(prev => ({ 
      ...prev, 
      isPaused: false 
    }));
  };

  // End reading session
  const endReading = () => {
    if (!session.sessionId) return;

    const sessionId = session.sessionId;

    void apiRequest(`/api/sessions/${sessionId}/end`, {
      method: 'PUT',
    }).catch((error) => {
      if (import.meta.env.DEV) {
        console.error('Failed to end reading session:', error);
      }
    });

    stopTimer();

    setSession(prev => ({
      ...prev,
      isLive: false,
      isPaused: false
    }));
    accumulatedElapsedMsRef.current = 0;
    activeSegmentStartedAtRef.current = null;
  };

  // Update reading position
  const updatePosition = (chapter: number, position: string) => {
    if (!session.sessionId || !socketRef.current) return;
    
    socketRef.current.emit('update_position', {
      sessionId: session.sessionId,
      currentChapter: chapter,
      currentPosition: position,
      timestamp: new Date().toISOString()
    });
    
    setSession(prev => ({ 
      ...prev, 
      currentChapter: chapter,
      currentPosition: position
    }));
  };

  // Fetch current listener count
  const fetchListenerCount = async () => {
    if (!session.sessionId) return;
    
    try {
      const response = await fetch(`/api/sessions/${session.sessionId}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        const nextCount = Number(data?.session?.listenerCount ?? 0);
        setSession(prev => ({ 
          ...prev, 
          listenerCount: nextCount,
        }));
      }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error fetching listener count:', error);
        }
      }
  };

  useEffect(() => {
    if (!session.sessionId || !session.isLive) {
      if (listenerPollRef.current) {
        clearInterval(listenerPollRef.current);
        listenerPollRef.current = null;
      }
      return;
    }

    void fetchListenerCount();

    listenerPollRef.current = setInterval(() => {
      void fetchListenerCount();
    }, 3000);

    return () => {
      if (listenerPollRef.current) {
        clearInterval(listenerPollRef.current);
        listenerPollRef.current = null;
      }
    };
  }, [session.sessionId, session.isLive]);

  return {
    session,
    createSession,
    startReading,
    pauseReading,
    resumeReading,
    endReading,
    updatePosition,
    fetchListenerCount
  };
}
