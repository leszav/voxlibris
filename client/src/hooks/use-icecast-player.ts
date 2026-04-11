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

export function useIcecastPlayer(
  options: IcecastPlayerOptions,
): IcecastPlayerState & IcecastPlayerControls {
  const { streamUrl, autoPlay = true, initialVolume = 0.9, onStatusChange, onError } = options;

  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(initialVolume);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const updateStatus = useCallback((next: PlayerStatus) => {
    setStatus(next);
    onStatusChange?.(next);
  }, [onStatusChange]);

  const reportError = useCallback((msg: string) => {
    setError(msg);
    updateStatus('error');
    onError?.(msg);
  }, [onError, updateStatus]);

  // Инициализация / смена URL потока
  useEffect(() => {
    if (!streamUrl) {
      // Останавливаем предыдущий поток
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      updateStatus('idle');
      return;
    }

    const audio = new Audio();
    audioRef.current = audio;

    audio.volume = initialVolume;
    audio.preload = 'none';

    // --- Обработчики событий ---

    audio.onwaiting = () => updateStatus('stalled');
    audio.onplaying = () => updateStatus('playing');
    audio.onpause   = () => {
      if (!audio.ended) updateStatus('paused');
    };
    audio.onended   = () => updateStatus('ended');

    audio.onerror = () => {
      const code = audio.error?.code;
      let msg = 'Ошибка воспроизведения потока';
      if (code === MediaError.MEDIA_ERR_NETWORK) {
        msg = 'Потерян сигнал — проблема с сетью';
      } else if (code === MediaError.MEDIA_ERR_DECODE) {
        msg = 'Ошибка декодирования аудио';
      } else if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        msg = 'Формат аудио не поддерживается браузером';
      }
      reportError(msg);
    };

    // Stall-детектор: если 10 секунд нет прогресса — ошибка
    let lastUpdateTime = Date.now();
    const stallTimer = setInterval(() => {
      if (audio.readyState >= 2 && !audio.paused && !audio.ended) {
        const now = Date.now();
        if (now - lastUpdateTime > 10_000) {
          reportError('Поток завис. Попробуйте перезапустить воспроизведение.');
          clearInterval(stallTimer);
        }
      }
    }, 2000);

    audio.ontimeupdate = () => { lastUpdateTime = Date.now(); };

    audio.src = streamUrl;

    if (autoPlay) {
      updateStatus('loading');
      audio.play().catch((err) => {
        // Autoplay blocked (политика браузера)
        if (err instanceof Error && err.name === 'NotAllowedError') {
          updateStatus('paused');
          // Не считаем ошибкой — пользователь просто нажмёт Play
        } else {
          reportError(`Не удалось запустить воспроизведение: ${err.message}`);
        }
      });
    }

    return () => {
      clearInterval(stallTimer);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [streamUrl]); // audioRef и state-сеттеры стабильны

  // --- Управление ---

  const play = useCallback((): void => {
    if (!audioRef.current) return;
    updateStatus('loading');
    audioRef.current.play().catch((err) => {
      reportError(`Не удалось воспроизвести: ${err.message}`);
    });
  }, [updateStatus, reportError]);

  const pause = useCallback((): void => {
    audioRef.current?.pause();
  }, []);

  const stop = useCallback((): void => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = '';
    updateStatus('idle');
  }, [updateStatus]);

  const handleSetVolume = useCallback((v: number): void => {
    const clamped = Math.max(0, Math.min(1, v));
    if (audioRef.current) audioRef.current.volume = clamped;
    setVolume(clamped);
  }, []);

  const toggleMute = useCallback((): void => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }, []);

  return { status, error, volume, isMuted, play, pause, stop, setVolume: handleSetVolume, toggleMute };
}
