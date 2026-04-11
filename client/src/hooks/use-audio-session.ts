/**
 * useAudioSession — Socket.IO-хук для событий сессии.
 *
 * Этот хук управляет только событиями сессии через Socket.IO:
 *   - счётчик слушателей
 *   - состояние сессии (started / ended / paused)
 *
 * Аудиопоток чтеца → Icecast через useAudioStream (HTTP fetch streaming)
 * Аудиопоток слушателей → <audio> от Icecast через useIcecastPlayer
 *
 * Socket.IO НЕ передаёт аудио-данные.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/token-store';

interface AudioSessionOptions {
  userId?: string | null;
}

interface AudioSessionStats {
  listenerCount: number;
  duration: number;
}

export function useAudioSession({ userId }: AudioSessionOptions) {
  const [listenerCount, setListenerCount] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats] = useState<AudioSessionStats | null>(null);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!userId) return;

    const token = getAccessToken();
    const socket = io('/', {
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setError(null);
    });

    socket.on('disconnect', () => {
      setError('Соединение с сервером разорвано');
      setSessionActive(false);
    });

    socket.on('session:started', () => {
      setSessionActive(true);
      setError(null);
    });

    socket.on('session:ended', () => {
      setSessionActive(false);
      setListenerCount(0);
    });

    socket.on('listeners:update', (data: { count: number }) => {
      setListenerCount(data.count);
    });

    socket.on('error', (data: { message?: string }) => {
      setError(data.message ?? 'Ошибка сессии');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  const joinSessionRoom = useCallback((sessionId: string): void => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('session:join', { sessionId });
  }, []);

  const leaveSessionRoom = useCallback((sessionId: string): void => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('session:leave', { sessionId });
  }, []);

  const notifyBroadcastStarted = useCallback((sessionId: string): void => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('broadcast:started', { sessionId });
  }, []);

  const notifyBroadcastEnded = useCallback((sessionId: string): void => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('broadcast:ended', { sessionId });
  }, []);

  const notifyBroadcastPaused = useCallback((sessionId: string): void => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('broadcast:paused', { sessionId });
  }, []);

  const notifyBroadcastResumed = useCallback((sessionId: string): void => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('broadcast:resumed', { sessionId });
  }, []);

  return {
    listenerCount,
    sessionActive,
    error,
    stats,
    joinSessionRoom,
    leaveSessionRoom,
    notifyBroadcastStarted,
    notifyBroadcastEnded,
    notifyBroadcastPaused,
    notifyBroadcastResumed,
  };
}
