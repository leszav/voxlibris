/**
 * useIcecastPlayer — хук для воспроизведения Icecast-потока слушателем.
 *
 * Простой, без лишних зависимостей: HTMLAudioElement + публичный URL потока.
 * Авторизация не нужна — Icecast отдаёт поток публично (через mount point).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stalled' | 'error' | 'ended';

export interface IcecastPlayerOptions {
  /** URL потока (null — плеер в режиме idle) */
  streamUrl: string | null;
  /** Автозапуск при получении streamUrl */
  autoPlay?: boolean;
  /** Начальная громкость 0–1 */
  initialVolume?: number;
  onStatusChange?: (status: PlayerStatus) => void;
  onError?: (message: string) => void;
}

export interface IcecastPlayerState {
  status: PlayerStatus;
  error: string | null;
  volume: number;
  isMuted: boolean;
}

export interface IcecastPlayerControls {
  play: () => void;
  pause: () => void;
  stop: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

type StatusListener = (status: PlayerStatus) => void;
type ErrorListener = (message: string) => void;

let sharedAudio: HTMLAudioElement | null = null;
let sharedStreamUrl: string | null = null;
let sharedStatus: PlayerStatus = 'idle';
let sharedError: string | null = null;
let sharedVolume = 0.9;
let sharedMuted = false;
let stallTimer: ReturnType<typeof setInterval> | null = null;
let lastUpdateTime = 0;
let suppressNextAudioError = false;

function normalizePublicStreamUrl(streamUrl: string): string {
  try {
    const url = new URL(streamUrl, globalThis.location?.origin);
    if (url.hostname === 'radio.voxlibris.ru' && url.port === '8000' && url.pathname.startsWith('/live/')) {
      url.protocol = 'https:';
      url.port = '';
      return url.toString();
    }
  } catch {
    // Ignore malformed URLs and let the native audio element surface the error.
  }

  return streamUrl;
}

const statusListeners = new Set<StatusListener>();
const errorListeners = new Set<ErrorListener>();

function notifyStatus(status: PlayerStatus): void {
  sharedStatus = status;
  statusListeners.forEach((listener) => listener(status));
}

function notifyError(message: string): void {
  sharedError = message;
  errorListeners.forEach((listener) => listener(message));
}

function clearStallTimer(): void {
  if (!stallTimer) return;
  clearInterval(stallTimer);
  stallTimer = null;
}

function attachSharedAudioEvents(audio: HTMLAudioElement): void {
  audio.onwaiting = () => notifyStatus('stalled');
  audio.onplaying = () => notifyStatus('playing');
  audio.onpause = () => {
    if (!audio.ended && audio.src) {
      notifyStatus('paused');
    }
  };
  audio.onended = () => notifyStatus('ended');
  audio.ontimeupdate = () => {
    lastUpdateTime = Date.now();
  };
  audio.onerror = () => {
    if (suppressNextAudioError) {
      suppressNextAudioError = false;
      return;
    }

    const code = audio.error?.code;
    let msg = 'Ошибка воспроизведения потока';
    if (code === MediaError.MEDIA_ERR_NETWORK) {
      msg = 'Потерян сигнал — проблема с сетью';
    } else if (code === MediaError.MEDIA_ERR_DECODE) {
      msg = 'Ошибка декодирования аудио';
    } else if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      msg = 'Формат аудио не поддерживается браузером';
    }
    notifyError(msg);
    notifyStatus('error');
  };
}

function ensureSharedAudio(initialVolume: number): HTMLAudioElement {
  if (sharedAudio) return sharedAudio;

  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = sharedVolume ?? initialVolume;
  audio.muted = sharedMuted;
  attachSharedAudioEvents(audio);
  sharedAudio = audio;
  return audio;
}

function startStallDetection(audio: HTMLAudioElement): void {
  clearStallTimer();
  lastUpdateTime = Date.now();
  stallTimer = setInterval(() => {
    if (audio.readyState >= 2 && !audio.paused && !audio.ended) {
      const now = Date.now();
      if (now - lastUpdateTime > 10_000) {
        notifyError('Поток завис. Попробуйте перезапустить воспроизведение.');
        notifyStatus('error');
        clearStallTimer();
      }
    }
  }, 2000);
}

async function startSharedPlayback(streamUrl: string, autoPlay: boolean, initialVolume: number): Promise<void> {
  const audio = ensureSharedAudio(initialVolume);
  const normalizedStreamUrl = normalizePublicStreamUrl(streamUrl);
  sharedError = null;
  sharedVolume = initialVolume;
  audio.volume = initialVolume;

  if (sharedStreamUrl === normalizedStreamUrl && !audio.paused && !audio.ended) {
    notifyStatus('playing');
    return;
  }

  if (sharedStreamUrl !== normalizedStreamUrl) {
    audio.pause();
    audio.src = normalizedStreamUrl;
    sharedStreamUrl = normalizedStreamUrl;
  }

  if (!autoPlay) {
    notifyStatus(audio.paused ? 'paused' : 'playing');
    return;
  }

  notifyStatus('loading');
  startStallDetection(audio);

  try {
    await audio.play();
    if (!audio.paused && !audio.ended) {
      notifyStatus('playing');
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'NotAllowedError') {
      notifyStatus('paused');
      return;
    }

    const message = err instanceof Error ? err.message : 'Не удалось запустить воспроизведение';
    notifyError(`Не удалось запустить воспроизведение: ${message}`);
    notifyStatus('error');
  }
}

export async function primeIcecastPlayback(streamUrl: string, initialVolume = 0.9): Promise<void> {
  await startSharedPlayback(streamUrl, true, initialVolume);
}

export function stopIcecastPlayback(): void {
  if (!sharedAudio) return;
  clearStallTimer();
  suppressNextAudioError = true;
  sharedAudio.pause();
  sharedAudio.src = '';
  sharedStreamUrl = null;
  sharedError = null;
  notifyStatus('idle');
}

export function useIcecastPlayer(
  options: IcecastPlayerOptions,
): IcecastPlayerState & IcecastPlayerControls {
  const { streamUrl, autoPlay = true, initialVolume = 0.9, onStatusChange, onError } = options;

  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(initialVolume);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(sharedAudio);

  const updateStatus = useCallback((next: PlayerStatus) => {
    setStatus(next);
    onStatusChange?.(next);
  }, [onStatusChange]);

  const reportError = useCallback((msg: string) => {
    setError(msg);
    updateStatus('error');
    onError?.(msg);
  }, [onError, updateStatus]);

  useEffect(() => {
    const statusListener: StatusListener = (next) => {
      setStatus(next);
      onStatusChange?.(next);
    };
    const errorListener: ErrorListener = (message) => {
      setError(message);
      onError?.(message);
    };

    statusListeners.add(statusListener);
    errorListeners.add(errorListener);

    setStatus(sharedStatus);
    setError(sharedError);
    setVolume(sharedVolume);
    setIsMuted(sharedMuted);

    return () => {
      statusListeners.delete(statusListener);
      errorListeners.delete(errorListener);
    };
  }, [onError, onStatusChange]);

  // Инициализация / смена URL потока
  useEffect(() => {
    if (!streamUrl) {
      updateStatus('idle');
      return;
    }
    void startSharedPlayback(streamUrl, autoPlay, initialVolume);
    audioRef.current = ensureSharedAudio(initialVolume);

    return () => {
      audioRef.current = sharedAudio;
    };
  }, [autoPlay, initialVolume, reportError, streamUrl, updateStatus]);

  // --- Управление ---

  const play = useCallback((): void => {
    if (!streamUrl) return;
    void startSharedPlayback(streamUrl, true, sharedVolume);
  }, [updateStatus, reportError]);

  const pause = useCallback((): void => {
    sharedAudio?.pause();
  }, []);

  const stop = useCallback((): void => {
    stopIcecastPlayback();
    updateStatus('idle');
  }, [updateStatus]);

  const handleSetVolume = useCallback((v: number): void => {
    const clamped = Math.max(0, Math.min(1, v));
    sharedVolume = clamped;
    if (sharedAudio) sharedAudio.volume = clamped;
    setVolume(clamped);
  }, []);

  const toggleMute = useCallback((): void => {
    setIsMuted((prev) => {
      const next = !prev;
      sharedMuted = next;
      if (sharedAudio) sharedAudio.muted = next;
      return next;
    });
  }, []);

  return { status, error, volume, isMuted, play, pause, stop, setVolume: handleSetVolume, toggleMute };
}
