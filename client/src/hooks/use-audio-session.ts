// client/src/hooks/use-audio-session.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/token-store';

interface AudioSessionOptions {
  role: 'reader' | 'listener';
  userId?: string | null;
}

interface AudioSessionStats {
  listenerCount: number;
  bytesTransferred: number;
  duration: number;
  lastChunkTimestamp: number;
}

type ClubTier = 'free' | 'standard' | 'premium' | 'elite';

interface AudioSessionConfig {
  bitrate: number;
  sampleRate: number;
  channels: number;
}

const TIER_CONFIGS: Record<ClubTier, AudioSessionConfig> = {
  free: { bitrate: 32, sampleRate: 22050, channels: 1 },
  standard: { bitrate: 64, sampleRate: 44100, channels: 1 },
  premium: { bitrate: 128, sampleRate: 44100, channels: 2 },
  elite: { bitrate: 256, sampleRate: 48000, channels: 2 },
};

export function useAudioSession({ role, userId }: AudioSessionOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listenerCount, setListenerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stats] = useState<AudioSessionStats | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [microphoneIssue, setMicrophoneIssue] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStoppingRef = useRef(false);
  const cleanupTrackListenersRef = useRef<(() => void) | null>(null);
  const cleanupDeviceListenerRef = useRef<(() => void) | null>(null);

  const clearMicrophoneIssue = useCallback(() => {
    setMicrophoneIssue(null);
  }, []);

  const teardownMonitoring = useCallback(() => {
    if (cleanupTrackListenersRef.current) {
      cleanupTrackListenersRef.current();
      cleanupTrackListenersRef.current = null;
    }

    if (cleanupDeviceListenerRef.current) {
      cleanupDeviceListenerRef.current();
      cleanupDeviceListenerRef.current = null;
    }
  }, []);

  const stopReading = useCallback((): void => {
    if (role !== 'reader' || isStoppingRef.current) {
      return;
    }

    isStoppingRef.current = true;

    try {
      teardownMonitoring();

      const mediaRecorder = mediaRecorderRef.current;
      if (mediaRecorder) {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
        mediaRecorder.ondataavailable = null;
        mediaRecorder.onerror = null;
      }
      mediaRecorderRef.current = null;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setMediaStream(null);

      if (sessionIdRef.current && socketRef.current?.connected) {
        socketRef.current.emit('audio:end_session', sessionIdRef.current);
      }

      sessionIdRef.current = null;
      setIsStreaming(false);
    } finally {
      isStoppingRef.current = false;
    }
  }, [role, teardownMonitoring]);

  const setupMicrophoneMonitoring = useCallback((stream: MediaStream) => {
    teardownMonitoring();

    const [track] = stream.getAudioTracks();
    if (!track) {
      setMicrophoneIssue('Микрофон не найден в текущем аудио-потоке.');
      setError('Микрофон недоступен');
      stopReading();
      return;
    }

    const handleTrackEnded = () => {
      if (isStoppingRef.current) return;

      const message = 'Микрофон отключился во время эфира. Проверьте устройство и перезапустите микрофон.';
      setMicrophoneIssue(message);
      setError(message);
      stopReading();
    };

    const handleTrackMute = () => {
      if (isStoppingRef.current || !track.enabled) return;
      setMicrophoneIssue('Микрофон временно не передает звук. Проверьте подключение или настройки ОС.');
    };

    const handleTrackUnmute = () => {
      setMicrophoneIssue(null);
    };

    track.addEventListener('ended', handleTrackEnded);
    track.addEventListener('mute', handleTrackMute);
    track.addEventListener('unmute', handleTrackUnmute);

    cleanupTrackListenersRef.current = () => {
      track.removeEventListener('ended', handleTrackEnded);
      track.removeEventListener('mute', handleTrackMute);
      track.removeEventListener('unmute', handleTrackUnmute);
    };

    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices?.addEventListener) {
      const handleDeviceChange = async () => {
        if (isStoppingRef.current) return;

        const activeTrack = streamRef.current?.getAudioTracks()[0];
        if (!activeTrack || activeTrack.readyState !== 'live') {
          handleTrackEnded();
          return;
        }

        try {
          const devices = await mediaDevices.enumerateDevices();
          const hasAudioInput = devices.some(device => device.kind === 'audioinput');
          if (!hasAudioInput) {
            const message = 'В системе не найден микрофон. Проверьте подключение устройства.';
            setMicrophoneIssue(message);
            setError(message);
            stopReading();
          }
        } catch (deviceError) {
          if (import.meta.env.DEV) {
            console.error('[AudioSession] Failed to validate devices after change:', deviceError);
          }
        }
      };

      mediaDevices.addEventListener('devicechange', handleDeviceChange);
      cleanupDeviceListenerRef.current = () => {
        mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
  }, [stopReading, teardownMonitoring]);

  // Подключение к Socket.IO при монтировании
  useEffect(() => {
    if (!userId) {
      setError('Пользователь не авторизован для аудио-сессии');
      return;
    }

    const token = getAccessToken();
    const socket = io('/', {
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (import.meta.env.DEV) {
        console.warn('[AudioSession] Connected to server');
      }
      setError(null);
    });

    socket.on('disconnect', () => {
      if (import.meta.env.DEV) {
        console.warn('[AudioSession] Disconnected from server');
      }
      setError('Соединение с аудио-сервером разорвано');
      setIsStreaming(false);
      setIsListening(false);
    });

    socket.on('audio:session_started', (data: { sessionId: string }) => {
      if (import.meta.env.DEV) {
        console.warn('[AudioSession] Session started:', data.sessionId);
      }
      setIsStreaming(true);
      setError(null);
    });

    socket.on('audio:session_joined', (data: { sessionId: string; listenerCount: number }) => {
      if (import.meta.env.DEV) {
        console.warn('[AudioSession] Joined session:', data);
      }
      setIsListening(true);
      setListenerCount(data.listenerCount);
      setError(null);
    });

    socket.on('audio:session_ended', (data: { sessionId: string }) => {
      if (import.meta.env.DEV) {
        console.warn('[AudioSession] Session ended:', data.sessionId);
      }
      setIsStreaming(false);
      setIsListening(false);
      setListenerCount(0);
      teardownMonitoring();
    });

    socket.on('error', (errorData: { message?: string }) => {
      const message = errorData.message ?? 'Ошибка аудио-сессии';
      setError(message);
      if (import.meta.env.DEV) {
        console.error('[AudioSession] Server error:', message);
      }
    });

    // Обработка входящих аудио-chunk'ов для listeners
    if (role === 'listener') {
      socket.on('audio:chunk', (chunk: { data: ArrayBuffer; timestamp: number; sequence: number }) => {
        // Здесь будет воспроизведение через AudioPlayer
        if (import.meta.env.DEV && chunk.sequence % 200 === 0) {
          console.warn('[AudioSession] Received audio chunk:', chunk.sequence, chunk.timestamp, chunk.data.byteLength);
        }
      });
    }

    return () => {
      if (role === 'reader') {
        stopReading();
      }
      teardownMonitoring();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [role, stopReading, teardownMonitoring, userId]);

  /**
   * Запуск стриминга (для reader'а)
   */
  const startReading = useCallback(async (
    sessionId: string,
    clubId: string,
    readerId: string,
    bookId: string,
    tier: ClubTier
  ): Promise<void> => {
    if (role !== 'reader') {
      throw new Error('Only readers can start streaming');
    }

    if (!userId) {
      throw new Error('Пользователь не авторизован');
    }

    if (!socketRef.current?.connected) {
      throw new Error('Нет соединения с аудио-сервером');
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Браузер не поддерживает доступ к микрофону');
    }

    if (!window.MediaRecorder) {
      throw new Error('Браузер не поддерживает запись аудио');
    }

    try {
      setError(null);
      setMicrophoneIssue(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: TIER_CONFIGS[tier].sampleRate,
          channelCount: TIER_CONFIGS[tier].channels,
        },
      });

      const [track] = stream.getAudioTracks();
      if (!track) {
        stream.getTracks().forEach(activeTrack => activeTrack.stop());
        throw new Error('Не удалось получить рабочий аудио-трек микрофона');
      }

      streamRef.current = stream;
      setMediaStream(stream);
      setupMicrophoneMonitoring(stream);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: TIER_CONFIGS[tier].bitrate * 1000,
      });

      mediaRecorderRef.current = mediaRecorder;

      let sequence = 0;
      mediaRecorder.ondataavailable = (event) => {
        const activeSessionId = sessionIdRef.current;
        if (event.data.size > 0 && socketRef.current?.connected && activeSessionId) {
          event.data.arrayBuffer().then(buffer => {
            socketRef.current?.emit('audio:chunk', {
              sessionId: activeSessionId,
              data: buffer,
              timestamp: Date.now(),
              sequence: sequence++,
            });
          }).catch(chunkError => {
            if (import.meta.env.DEV) {
              console.error('[AudioSession] Failed to process audio chunk:', chunkError);
            }
          });
        }
      };

      mediaRecorder.onerror = () => {
        const message = 'Ошибка MediaRecorder';
        setError(message);
        setMicrophoneIssue('Ошибка записи аудио с микрофона. Проверьте устройство.');
        stopReading();
      };

      const socket = socketRef.current;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Сервер не подтвердил запуск аудио-сессии. Попробуйте снова.'));
        }, 5000);

        const onSessionStarted = (data: { sessionId: string }) => {
          if (data.sessionId !== sessionId) return;
          cleanup();
          resolve();
        };

        const onSessionError = (errorData: { message?: string }) => {
          cleanup();
          reject(new Error(errorData.message ?? 'Не удалось запустить аудио-сессию'));
        };

        const cleanup = () => {
          clearTimeout(timeout);
          socket.off('audio:session_started', onSessionStarted);
          socket.off('error', onSessionError);
        };

        socket.on('audio:session_started', onSessionStarted);
        socket.on('error', onSessionError);

        socket.emit('audio:start_session', {
          sessionId,
          clubId,
          readerId,
          bookId,
          config: TIER_CONFIGS[tier],
        });
      });

      sessionIdRef.current = sessionId;
      mediaRecorder.start(100);
      setIsStreaming(true);

      if (import.meta.env.DEV) {
        console.warn('[AudioSession] Started streaming:', sessionId);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Не удалось получить доступ к микрофону';
      setError(errorMessage);
      stopReading();
      throw new Error(errorMessage);
    }
  }, [role, setupMicrophoneMonitoring, stopReading, userId]);

  /**
   * Начать прослушивание (для listener'а)
   */
  const startListening = useCallback((sessionId: string): void => {
    if (role !== 'listener') {
      throw new Error('Only listeners can join sessions');
    }

    if (socketRef.current) {
      socketRef.current.emit('audio:join_session', sessionId);
      sessionIdRef.current = sessionId;

      if (import.meta.env.DEV) {
        console.warn('[AudioSession] Started listening to:', sessionId);
      }
    }
  }, [role]);

  /**
   * Прекратить прослушивание
   */
  const stopListening = useCallback((): void => {
    if (sessionIdRef.current && socketRef.current) {
      // Переподключаем socket для выхода из аудио-комнаты
      socketRef.current.disconnect();
      socketRef.current.connect();
    }

    sessionIdRef.current = null;
    setIsListening(false);

    if (import.meta.env.DEV) {
      console.warn('[AudioSession] Stopped listening');
    }
  }, []);

  const setMicrophoneMuted = useCallback((muted: boolean): void => {
    const currentStream = streamRef.current;
    if (!currentStream) return;

    currentStream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }, []);

  /**
   * Получить MediaStream для VU-meter (только для reader'а)
   */
  const getMediaStream = (): MediaStream | null => {
    return role === 'reader' ? mediaStream : null;
  };

  return {
    // States
    isStreaming,
    isListening,
    listenerCount,
    error,
    stats,
    mediaStream,
    microphoneIssue,

    // Actions
    startReading,
    stopReading,
    startListening,
    stopListening,
    clearMicrophoneIssue,
    setMicrophoneMuted,

    // Utils
    getMediaStream,
  };
}
