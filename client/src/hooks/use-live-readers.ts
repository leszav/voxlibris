/**
 * useLiveReaders — хук для работы с live-чтецами клуба.
 *
 * Обнаружение чтецов: REST polling каждые 3 секунды
 *   GET /api/clubs/:clubId/live-readers
 *   → всегда актуально, не зависит от момента подключения
 *
 * Синхронизация позиции (только для слушателей): WebSocket
 *   live_reader:position_update
 *
 * Методы для чтеца: announceLiveStart / announceLiveStop / broadcastPosition
 *   → WS emit к серверу
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, syncTokenFromCookie } from '@/lib/token-store';

export interface LiveReader {
  sessionId: string;
  readerId: string;
  readerName: string;
  chapter: number;
  positionRaw?: string;
  streamUrl: string;
  startedAt: string;
  clubId?: string;
  bookId?: string;
  isPaused?: boolean;
}

export interface LiveReaderPosition {
  sessionId: string;
  readerId: string;
  chapter: number;
  positionRaw: string;
  timestamp: number;
}

function upsertReader(prev: LiveReader[], reader: LiveReader): LiveReader[] {
  const existingIndex = prev.findIndex((item) => item.sessionId === reader.sessionId);
  if (existingIndex === -1) {
    return [...prev, reader];
  }

  const next = [...prev];
  next[existingIndex] = { ...next[existingIndex], ...reader };
  return next;
}

function removeReader(prev: LiveReader[], sessionId: string): LiveReader[] {
  return prev.filter((reader) => reader.sessionId !== sessionId);
}

interface UseLiveReadersOptions {
  clubId: string;
  bookId: string;
  /** Вызывается при обновлении позиции чтеца которого слушает пользователь */
  onPositionUpdate?: (update: LiveReaderPosition) => void;
  /** ID сессии чтеца, которого слушает пользователь (для фильтрации position_update) */
  listeningToSessionId?: string | null;
}

export function useLiveReaders({
  clubId,
  bookId,
  onPositionUpdate,
  listeningToSessionId,
}: Readonly<UseLiveReadersOptions>) {
  // ── Polling: обнаружение активных чтецов ─────────────────────────────
  const prevSessionIdsRef = useRef<Set<string>>(new Set());
  const [flashCount, setFlashCount] = useState(0);
  const [readers, setReaders] = useState<LiveReader[]>([]);
  const [hasSnapshot, setHasSnapshot] = useState(false);

  const { data: pollData } = useQuery({
    queryKey: ['live-readers', clubId],
    queryFn: async (): Promise<{ readers: LiveReader[] }> => {
      syncTokenFromCookie();
      const token = getAccessToken();
      const response = await fetch(`/api/clubs/${clubId}/live-readers`, {
        credentials: 'include',
        cache: 'no-store',
        headers: token ? {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        } : {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load live readers: ${response.status}`);
      }

      return response.json() as Promise<{ readers: LiveReader[] }>;
    },
    enabled: !!clubId,
    refetchInterval: 3000,
    staleTime: 0,
  });

  useEffect(() => {
    if (!pollData) return;
    setReaders(pollData.readers ?? []);
    setHasSnapshot(true);
  }, [pollData]);

  // Вспышка при появлении нового чтеца
  useEffect(() => {
    const currentIds = new Set(readers.map((r) => r.sessionId));
    let hasNew = false;
    for (const id of currentIds) {
      if (!prevSessionIdsRef.current.has(id)) { hasNew = true; break; }
    }
    if (hasNew) setFlashCount((n) => n + 1);
    prevSessionIdsRef.current = currentIds;
  }, [readers]);

  // ── WebSocket: только для синхронизации позиции ───────────────────────
  const socketRef = useRef<Socket | null>(null);
  const pendingStartRef = useRef<{
    sessionId: string;
    chapter: number;
    readerName: string;
  } | null>(null);
  const liveSessionIdRef = useRef<string | null>(null);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const onPositionUpdateRef = useRef(onPositionUpdate);
  const listeningToRef = useRef(listeningToSessionId);

  useEffect(() => { onPositionUpdateRef.current = onPositionUpdate; }, [onPositionUpdate]);
  useEffect(() => { listeningToRef.current = listeningToSessionId; }, [listeningToSessionId]);

  useEffect(() => {
    if (!clubId || !bookId) return;

    syncTokenFromCookie();
    const token = getAccessToken();
    const socket = io('/', {
      path: '/ws/reader',
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_club', { clubId });
      socket.emit('join_book', { bookId, clubId });

      // Если чтец стартовал раньше подключения сокета — отправляем отложенный старт.
      if (pendingStartRef.current) {
        socket.emit('live_reader:start', { clubId, bookId, ...pendingStartRef.current });
        pendingStartRef.current = null;
      }
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('connect_error', (error) => {
      if (import.meta.env.DEV) {
        console.error('[useLiveReaders] WS Reader connect_error:', error.message);
      }
    });

    socket.on('error', (error) => {
      if (import.meta.env.DEV) {
        console.error('[useLiveReaders] WS Reader socket error:', error);
      }
    });

    socket.on('live_reader:started', (reader: LiveReader) => {
      if (reader.clubId !== clubId || reader.bookId !== bookId) return;
      setHasSnapshot(true);

      setReaders((prev) => upsertReader(prev, reader));
    });

    socket.on('live_reader:ended', (payload: { sessionId: string }) => {
      setHasSnapshot(true);
      setReaders((prev) => removeReader(prev, payload.sessionId));
    });

    socket.on('live_reader:position_update', (update: LiveReaderPosition) => {
      if (!listeningToRef.current) return;
      if (update.sessionId !== listeningToRef.current) return;
      onPositionUpdateRef.current?.(update);
    });

    return () => {
      socket.emit('leave_book', { bookId, clubId });
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [clubId, bookId]);

  useEffect(() => {
    if (!connected || !liveSessionId) return;

    const timer = globalThis.setInterval(() => {
      socketRef.current?.emit('live_reader:heartbeat', { sessionId: liveSessionId });
    }, 30000);

    return () => globalThis.clearInterval(timer);
  }, [connected, liveSessionId]);

  // ── Методы для чтеца ─────────────────────────────────────────────────

  const announceLiveStart = useCallback((params: {
    sessionId: string;
    chapter: number;
    readerName: string;
  }): void => {
    liveSessionIdRef.current = params.sessionId;
    setLiveSessionId(params.sessionId);

    const socket = socketRef.current;
    if (socket?.connected) {
      if (import.meta.env.DEV) {
        console.warn('[useLiveReaders] announce live start immediately', params.sessionId);
      }
      socket.emit('live_reader:start', { clubId, bookId, ...params });
      return;
    }

    // Сокет ещё не поднят — отложим announce до события connect.
    if (import.meta.env.DEV) {
      console.warn('[useLiveReaders] defer live start until socket connect', params.sessionId);
    }
    pendingStartRef.current = params;
  }, [clubId, bookId]);

  const announceLiveStop = useCallback((sessionId: string): void => {
    if (liveSessionIdRef.current === sessionId) {
      liveSessionIdRef.current = null;
      setLiveSessionId(null);
    }
    socketRef.current?.emit('live_reader:stop', { clubId, bookId, sessionId });
  }, [clubId, bookId]);

  const broadcastPosition = useCallback((params: {
    sessionId: string;
    chapter: number;
    positionRaw: string;
  }): void => {
    socketRef.current?.emit('live_reader:position', { clubId, bookId, ...params });
    socketRef.current?.emit('live_reader:heartbeat', { sessionId: params.sessionId });
  }, [clubId, bookId]);

  return {
    readers,
    hasSnapshot,
    flashCount,
    connected,
    announceLiveStart,
    announceLiveStop,
    broadcastPosition,
  };
}
