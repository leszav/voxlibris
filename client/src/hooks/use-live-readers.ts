/**
 * useLiveReaders — хук для получения уведомлений об активных чтецах в клубе.
 *
 * Подключается к WS-серверу (/ws/reader) и подписывается на:
 *   - live_reader:started  → чтец начал читать
 *   - live_reader:ended    → чтец завершил
 *   - live_reader:position_update → позиция чтеца (для слушателя)
 *
 * Также позволяет чтецу:
 *   - объявить начало (announceLiveStart)
 *   - объявить конец  (announceLiveStop)
 *   - трансляцию позиции (broadcastPosition)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/token-store';

export interface LiveReader {
  sessionId: string;
  readerId: string;
  readerName: string;
  chapter: number;
  streamUrl: string;
  startedAt: string;
}

export interface LiveReaderPosition {
  sessionId: string;
  readerId: string;
  chapter: number;
  positionRaw: string;
  timestamp: number;
}

interface UseLiveReadersOptions {
  clubId: string;
  bookId: string;
  /** Вызывается при обновлении позиции чтеца которого слушает пользователь */
  onPositionUpdate?: (update: LiveReaderPosition) => void;
  /** ID сессии чтеца, которого слушает пользователь (для фильтрации position_update) */
  listeningToSessionId?: string | null;
}

function addReader(prev: LiveReader[], reader: LiveReader): LiveReader[] {
  if (prev.some((r) => r.sessionId === reader.sessionId)) return prev;
  return [...prev, reader];
}

function removeReader(prev: LiveReader[], sessionId: string): LiveReader[] {
  return prev.filter((r) => r.sessionId !== sessionId);
}

export function useLiveReaders({
  clubId,
  bookId,
  onPositionUpdate,
  listeningToSessionId,
}: Readonly<UseLiveReadersOptions>) {
  const [readers, setReaders] = useState<LiveReader[]>([]);
  const [flashCount, setFlashCount] = useState(0); // увеличивается при каждом новом чтеце
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const onPositionUpdateRef = useRef(onPositionUpdate);
  const listeningToRef = useRef(listeningToSessionId);

  // Обновляем ref без пересоздания сокета
  useEffect(() => { onPositionUpdateRef.current = onPositionUpdate; }, [onPositionUpdate]);
  useEffect(() => { listeningToRef.current = listeningToSessionId; }, [listeningToSessionId]);

  useEffect(() => {
    if (!clubId || !bookId) return;

    const token = getAccessToken();
    const socket = io('/ws/reader', {
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Присоединяемся к клубной комнате и комнате книги
      socket.emit('join_club', { clubId });
      socket.emit('join_book', { bookId, clubId });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    const onReaderStarted = (reader: LiveReader) => {
      setReaders((prev) => addReader(prev, reader));
      setFlashCount((n) => n + 1);
    };

    const onReaderEnded = (data: { sessionId: string }) => {
      setReaders((prev) => removeReader(prev, data.sessionId));
    };

    const onPositionUpdate = (update: LiveReaderPosition) => {
      if (!listeningToRef.current) return;
      if (update.sessionId !== listeningToRef.current) return;
      onPositionUpdateRef.current?.(update);
    };

    socket.on('live_reader:started', onReaderStarted);
    socket.on('live_reader:ended', onReaderEnded);
    socket.on('live_reader:position_update', onPositionUpdate);

    return () => {
      socket.emit('leave_book', { bookId, clubId });
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [clubId, bookId]);

  // ── Методы для чтеца ─────────────────────────────────────────────────

  const announceLiveStart = useCallback((params: {
    sessionId: string;
    chapter: number;
    readerName: string;
    streamUrl: string;
  }): void => {
    socketRef.current?.emit('live_reader:start', {
      clubId,
      bookId,
      ...params,
    });
  }, [clubId, bookId]);

  const announceLiveStop = useCallback((sessionId: string): void => {
    socketRef.current?.emit('live_reader:stop', { clubId, bookId, sessionId });
  }, [clubId, bookId]);

  const broadcastPosition = useCallback((params: {
    sessionId: string;
    chapter: number;
    positionRaw: string;
  }): void => {
    socketRef.current?.emit('live_reader:position', {
      clubId,
      bookId,
      ...params,
    });
  }, [clubId, bookId]);

  return {
    readers,
    flashCount,
    connected,
    announceLiveStart,
    announceLiveStop,
    broadcastPosition,
  };
}
