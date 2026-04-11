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
import { getAccessToken } from '@/lib/token-store';

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

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1,
};

function getBestMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

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
  const statusRef = useRef<StreamStatus>('idle');

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

  const cleanup = useCallback(() => {
    // Завершаем stream controller
    try { streamControllerRef.current?.close(); } catch { /* already closed */ }
    streamControllerRef.current = null;

    // Останавливаем MediaRecorder
    if (streamRecorderRef.current?.state !== 'inactive') {
      try { streamRecorderRef.current?.stop(); } catch { /* ignore */ }
    }
    streamRecorderRef.current = null;

    if (localRecorderRef.current?.state !== 'inactive') {
      try { localRecorderRef.current?.stop(); } catch { /* ignore */ }
    }
    localRecorderRef.current = null;

    // Освобождаем микрофон
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setMediaStream(null);

    // Прерываем fetch
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    fetchPromiseRef.current = null;
  }, []);

  // Размонтирование
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

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
      stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
    } catch (err) {
      let msg = `Ошибка доступа к микрофону: ${err instanceof Error ? err.message : String(err)}`;
      if (err instanceof Error && err.name === 'NotAllowedError') {
        msg = 'Доступ к микрофону запрещён. Разрешите его в настройках браузера.';
      }
      reportMicError(msg);
      return;
    }

    mediaStreamRef.current = stream;
    setMediaStream(stream);

    // 2. Выбираем MIME тип
    const mimeType = getBestMimeType();
    if (!mimeType) {
      stream.getTracks().forEach((t) => t.stop());
      reportMicError('Браузер не поддерживает запись голоса. Используйте Chrome 105+.');
      return;
    }

    // 3. Создаём ReadableStream для передачи в fetch
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        streamControllerRef.current = controller;
      },
      cancel() {
        streamControllerRef.current = null;
      },
    });

    // 4. Настраиваем MediaRecorder (стрим в Icecast)
    const streamRecorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 64_000,
    });

    streamRecorder.ondataavailable = (e) => {
      if (e.data.size === 0 || !streamControllerRef.current) return;
      e.data.arrayBuffer().then((buf) => {
        streamControllerRef.current?.enqueue(new Uint8Array(buf));
      });
    };

    streamRecorder.onerror = () => {
      reportMicError('Ошибка записи звука. Проверьте микрофон.');
      cleanup();
    };

    streamRecorderRef.current = streamRecorder;

    // 5. Настраиваем локальный MediaRecorder (запись)
    if (enableRecording) {
      const localRecorder = new MediaRecorder(stream, { mimeType });
      localChunksRef.current = [];

      localRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) localChunksRef.current.push(e.data);
      };

      localRecorder.onstop = () => {
        const blob = new Blob(localChunksRef.current, { type: mimeType });
        setRecordingBlob(blob);
        setIsRecording(false);
      };

      localRecorderRef.current = localRecorder;
    }

    // 6. Запускаем fetch (long-running streaming request)
    const token = getAccessToken();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetchPromiseRef.current = (async () => {
      try {
        const response = await fetch(`/api/studio/stream/${sessionId}`, {
          method: 'POST',
          // @ts-expect-error duplex не в стандартных типах TS, но нужен для request streaming
          duplex: 'half',
          body: readable,
          headers: {
            'Content-Type': mimeType,
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
          credentials: 'include',
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          reportStreamError(body.error ?? `Сервер отклонил подключение (${response.status})`);
          cleanup();
          return;
        }

        // Сервер ответил 200 — Icecast принял поток
        updateStatus('streaming');

      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Нормальное завершение через stop()
          updateStatus('stopped');
          return;
        }
        reportStreamError(`Ошибка соединения со стримом: ${err instanceof Error ? err.message : String(err)}`);
        cleanup();
      }
    })();

    // 7. Запускаем рекордеры
    streamRecorder.start(250); // chunk каждые 250 мс

    if (enableRecording && localRecorderRef.current) {
      localRecorderRef.current.start(1000); // chunk каждую секунду для записи
      setIsRecording(true);
    }

    // Мониторинг: трек завершился (микрофон отключился физически)
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (statusRef.current === 'streaming') {
        reportMicError('Микрофон отключился. Проверьте устройство.');
        cleanup();
      }
    });

  }, [sessionId, enableRecording, reportMicError, reportStreamError, updateStatus, cleanup]);

  // --- Остановка ---

  const stop = useCallback((): void => {
    if (status === 'idle' || status === 'stopped') return;

    // Завершаем stream → fetch получит конец body → Icecast закроет mountpoint
    try { streamControllerRef.current?.close(); } catch { /* ignore */ }
    streamControllerRef.current = null;

    // Останавливаем recorder'ы
    if (streamRecorderRef.current?.state !== 'inactive') {
      streamRecorderRef.current?.stop();
    }

    if (localRecorderRef.current?.state !== 'inactive') {
      localRecorderRef.current?.stop(); // вызовет onstop → запишет blob
    }

    // Освобождаем микрофон
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setMediaStream(null);

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    updateStatus('stopped');
  }, [status, updateStatus]);

  // --- Пауза / возобновление ---

  const pause = useCallback((): void => {
    if (streamRecorderRef.current?.state === 'recording') {
      streamRecorderRef.current.pause();
      localRecorderRef.current?.pause();
      updateStatus('paused');
    }
  }, [updateStatus]);

  const resume = useCallback((): void => {
    if (streamRecorderRef.current?.state === 'paused') {
      streamRecorderRef.current.resume();
      localRecorderRef.current?.resume();
      updateStatus('streaming');
    }
  }, [updateStatus]);

  // --- Mute (отключение микрофона без остановки потока) ---

  const mute = useCallback((muted: boolean): void => {
    mediaStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, []);

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
