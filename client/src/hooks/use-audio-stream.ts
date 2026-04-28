/**
 * useAudioStream — хук для стриминга голоса чтеца через Icecast-прокси.
 *
 * Архитектура:
 *   getUserMedia() → MediaRecorder (Opus/WebM)
 *     ├── chunks → fetch POST /api/studio/stream/:sessionId  (→ Icecast)
 *     └── chunks → локальный blob  (запись для клуба чтеца)
 *
 * Запись активируется опционально; файл доступен после окончания эфира.
 *
 * Требования к браузеру: Chrome 105+ (fetch duplex streaming).
 * Читатель использует только desktop — это покрыто требованиями ТЗ.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getStudioStreamConnectionErrorMessage,
  getStudioStreamStartErrorMessage,
} from '@/lib/studio-streaming-errors';
import {
  getStudioAudioMimeType,
  getStudioMicrophoneErrorMessage,
  requestStudioMicrophoneStream,
} from '@/lib/studio-media-input';
import {
  createStudioLocalRecorder,
  createStudioStreamRecorder,
} from '@/lib/studio-media-recorder';
import { createStudioRecordingBlob } from '@/lib/studio-recording-blob';
import { bindStudioMicrophoneEnded } from '@/lib/studio-media-track';
import { createStudioStreamingBody } from '@/lib/studio-streaming-body';
import { startStudioStreamIngest } from '@/lib/studio-streaming-gateway';

// --- Типы ---

export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'paused' | 'error' | 'stopped';

export interface AudioStreamOptions {
  /** ID сессии чтения (нужен для mount point на Icecast) */
  sessionId: string | null;
  /** Включить параллельную локальную запись */
  enableRecording?: boolean;
  /** Колбэк при смене статуса */
  onStatusChange?: (status: StreamStatus) => void;
  /** Колбэк при ошибке. source='microphone' — проблема с микрофоном, source='stream' — ошибка сети/Icecast */
  onError?: (message: string, source: 'microphone' | 'stream') => void;
}

export interface AudioStreamState {
  status: StreamStatus;
  error: string | null;
  /** Текущий MediaStream (для VU-метра) */
  mediaStream: MediaStream | null;
  /** true если запись активна */
  isRecording: boolean;
  /** Blob записи после окончания (если enableRecording) */
  recordingBlob: Blob | null;
}

export interface AudioStreamControls {
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  mute: (muted: boolean) => void;
  downloadRecording: (filename?: string) => void;
}

// --- Вспомогательные ---

// --- Хук ---

export function useAudioStream(options: AudioStreamOptions): AudioStreamState & AudioStreamControls {
  const { sessionId, enableRecording = false, onStatusChange, onError } = options;

  const [status, setStatus] = useState<StreamStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);

  // Ссылки (не вызывают ре-рендер)
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const streamRecorderRef = useRef<MediaRecorder | null>(null);    // стримит в Icecast
  const localRecorderRef = useRef<MediaRecorder | null>(null);     // локальная запись
  const localChunksRef = useRef<Blob[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchPromiseRef = useRef<Promise<void> | null>(null);
  const detachTrackEndedRef = useRef<(() => void) | null>(null);
  const statusRef = useRef<StreamStatus>('idle');
  const pausedRef = useRef(false);
  const mutedRef = useRef(false);
  const mimeTypeRef = useRef<string | null>(null);
  const pauseRequestedRef = useRef(false);

  // Readable stream controller для передачи chunks в fetch
  const streamControllerRef = useRef<ReadableStreamDefaultController<Uint8Array> | null>(null);

  const updateStatus = useCallback((next: StreamStatus) => {
    statusRef.current = next;
    setStatus(next);
    onStatusChange?.(next);
  }, [onStatusChange]);

  const reportMicError = useCallback((message: string) => {
    setError(message);
    updateStatus('error');
    onError?.(message, 'microphone');
  }, [onError, updateStatus]);

  const reportStreamError = useCallback((message: string) => {
    setError(message);
    updateStatus('error');
    onError?.(message, 'stream');
  }, [onError, updateStatus]);

  const applyTrackState = useCallback(() => {
    const enabled = !(pausedRef.current || mutedRef.current);
    mediaStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, []);

  const closeStreamController = useCallback(() => {
    try { streamControllerRef.current?.close(); } catch { /* already closed */ }
    streamControllerRef.current = null;
  }, []);

  const stopStreamingTransport = useCallback(() => {
    closeStreamController();

    if (streamRecorderRef.current?.state !== 'inactive') {
      try { streamRecorderRef.current?.stop(); } catch { /* ignore */ }
    }
    streamRecorderRef.current = null;

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    fetchPromiseRef.current = null;
  }, [closeStreamController]);

  const stopRecorders = useCallback(() => {
    if (streamRecorderRef.current?.state !== 'inactive') {
      try { streamRecorderRef.current?.stop(); } catch { /* ignore */ }
    }
    streamRecorderRef.current = null;

    if (localRecorderRef.current?.state !== 'inactive') {
      try { localRecorderRef.current?.stop(); } catch { /* ignore */ }
    }
    localRecorderRef.current = null;
  }, []);

  const pauseRecorders = useCallback(() => {
    if (streamRecorderRef.current?.state === 'recording') {
      try { streamRecorderRef.current.pause(); } catch { /* ignore */ }
    }

    if (localRecorderRef.current?.state === 'recording') {
      try { localRecorderRef.current.pause(); } catch { /* ignore */ }
    }
  }, []);

  const resumeRecorders = useCallback(() => {
    if (streamRecorderRef.current?.state === 'paused') {
      try { streamRecorderRef.current.resume(); } catch { /* ignore */ }
    }

    if (localRecorderRef.current?.state === 'paused') {
      try { localRecorderRef.current.resume(); } catch { /* ignore */ }
    }
  }, []);

  const releaseMediaStream = useCallback(() => {
    detachTrackEndedRef.current?.();
    detachTrackEndedRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setMediaStream(null);
  }, []);

  const cleanup = useCallback(() => {
    stopStreamingTransport();
    stopRecorders();
    releaseMediaStream();
    pausedRef.current = false;
    pauseRequestedRef.current = false;
    mimeTypeRef.current = null;
  }, [releaseMediaStream, stopRecorders, stopStreamingTransport]);

  // Размонтирование
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  const startStreamingTransport = useCallback(async (stream: MediaStream, mimeType: string): Promise<void> => {
    if (!sessionId) {
      reportStreamError('sessionId обязателен для запуска стрима');
      return;
    }

    pauseRequestedRef.current = false;

    // 1. Создаём ReadableStream для передачи chunks в fetch
    const { body: readable } = createStudioStreamingBody((controller) => {
      streamControllerRef.current = controller;
    });

    // 2. Настраиваем MediaRecorder (стрим в Icecast)
    const streamRecorder = createStudioStreamRecorder({
      stream,
      mimeType,
      onChunk: (chunk) => {
        if (!streamControllerRef.current) return;
        chunk.arrayBuffer().then((buf) => {
          streamControllerRef.current?.enqueue(new Uint8Array(buf));
        });
      },
      onError: () => {
        reportMicError('Ошибка записи звука. Проверьте микрофон.');
        cleanup();
      },
    });

    streamRecorderRef.current = streamRecorder;

    // 3. Запускаем fetch (long-running streaming request)
    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetchPromiseRef.current = (async () => {
      try {
        const response = await startStudioStreamIngest({
          sessionId,
          mimeType,
          body: readable,
          signal: controller.signal,
        });

        const startErrorMessage = await getStudioStreamStartErrorMessage(response);
        if (startErrorMessage) {
          reportStreamError(startErrorMessage);
          cleanup();
          return;
        }

        // Сервер ответил 200 — Icecast принял поток
        updateStatus('streaming');

      } catch (err) {
        const connectionErrorMessage = getStudioStreamConnectionErrorMessage(err);
        if (connectionErrorMessage === null) {
          if (pauseRequestedRef.current) {
            pauseRequestedRef.current = false;
            updateStatus('paused');
            return;
          }

          // Нормальное завершение через stop()
          updateStatus('stopped');
          return;
        }
        reportStreamError(connectionErrorMessage);
        cleanup();
      }
    })();

    // 4. Запускаем рекордер стрима
    streamRecorder.start(250); // chunk каждые 250 мс

    await Promise.resolve();
  }, [cleanup, reportMicError, reportStreamError, sessionId, updateStatus]);

  // --- Запуск ---

  const start = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      reportStreamError('sessionId обязателен для запуска стрима');
      return;
    }

    if (statusRef.current === 'streaming' || statusRef.current === 'connecting') return;

    setError(null);
    setRecordingBlob(null);
    updateStatus('connecting');

    // 1. Получаем микрофон
    let stream: MediaStream;
    try {
      stream = await requestStudioMicrophoneStream();
    } catch (err) {
      reportMicError(getStudioMicrophoneErrorMessage(err));
      return;
    }

    mediaStreamRef.current = stream;
    setMediaStream(stream);
    pausedRef.current = false;
    applyTrackState();

    // 2. Выбираем MIME тип
    const mimeType = getStudioAudioMimeType();
    if (!mimeType) {
      stream.getTracks().forEach((track) => track.stop());
      reportMicError('Браузер не поддерживает запись голоса. Используйте Chrome 105+.');
      return;
    }

    mimeTypeRef.current = mimeType;

    // 3. Настраиваем локальный MediaRecorder (запись)
    if (enableRecording) {
      localChunksRef.current = [];

      const localRecorder = createStudioLocalRecorder({
        stream,
        mimeType,
        onChunk: (chunk) => {
          localChunksRef.current.push(chunk);
        },
        onStop: () => {
          const blob = createStudioRecordingBlob(localChunksRef.current, mimeType);
          setRecordingBlob(blob);
          setIsRecording(false);
        },
      });

      localRecorderRef.current = localRecorder;
    }

    await startStreamingTransport(stream, mimeType);

    if (enableRecording && localRecorderRef.current) {
      localRecorderRef.current.start(1000); // chunk каждую секунду для записи
      setIsRecording(true);
    }

    // Мониторинг: трек завершился (микрофон отключился физически)
    detachTrackEndedRef.current = bindStudioMicrophoneEnded(stream, () => {
      if (statusRef.current === 'streaming') {
        reportMicError('Микрофон отключился. Проверьте устройство.');
        cleanup();
      }
    });

  }, [sessionId, enableRecording, reportMicError, updateStatus, cleanup, applyTrackState, startStreamingTransport]);

  // --- Остановка ---

  const stop = useCallback((): void => {
    if (status === 'idle' || status === 'stopped') return;

    stopStreamingTransport();
    stopRecorders();
    releaseMediaStream();
    pauseRequestedRef.current = false;
    pausedRef.current = false;
    mimeTypeRef.current = null;

    updateStatus('stopped');
  }, [status, releaseMediaStream, stopRecorders, stopStreamingTransport, updateStatus]);

  // --- Пауза / возобновление ---

  const pause = useCallback((): void => {
    if (statusRef.current === 'streaming') {
      pausedRef.current = true;
      applyTrackState();
      pauseRequestedRef.current = true;
      stopStreamingTransport();
      pauseRecorders();
      updateStatus('paused');
    }
  }, [applyTrackState, pauseRecorders, stopStreamingTransport, updateStatus]);

  const resume = useCallback((): void => {
    if (statusRef.current === 'paused') {
      pausedRef.current = false;
      applyTrackState();
      resumeRecorders();
      const stream = mediaStreamRef.current;
      const mimeType = mimeTypeRef.current;

      if (!stream || !mimeType) {
        void start();
        return;
      }

      updateStatus('connecting');
      void startStreamingTransport(stream, mimeType);
    }
  }, [applyTrackState, resumeRecorders, start, startStreamingTransport, updateStatus]);

  // --- Mute (отключение микрофона без остановки потока) ---

  const mute = useCallback((muted: boolean): void => {
    mutedRef.current = muted;
    applyTrackState();
  }, [applyTrackState]);

  // --- Скачать запись ---

  const downloadRecording = useCallback((filename = 'voxlibris-recording.webm'): void => {
    if (!recordingBlob) return;
    const url = URL.createObjectURL(recordingBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [recordingBlob]);

  return {
    status,
    error,
    mediaStream,
    isRecording,
    recordingBlob,
    start,
    stop,
    pause,
    resume,
    mute,
    downloadRecording,
  };
}
