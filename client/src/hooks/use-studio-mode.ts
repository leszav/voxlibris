/**
 * useStudioMode — инкапсулирует всю аудио/сессионную логику студии чтеца.
 *
 * Используется внутри ClubReader для режима «читать вслух» без навигации
 * на отдельную страницу.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useReadingSession } from './use-reading-session';
import { useAudioSession } from './use-audio-session';
import { useAudioStream } from './use-audio-stream';
import { useRealVUMeter } from './use-real-vu-meter';
import { useMicrophoneDetection } from './use-microphone-detection';

interface UseStudioModeOptions {
  clubId: string;
  bookId: string;
  currentChapter: number;
  readerName: string;
  userId?: string;
  /** Хук активен только когда enabled=true, чтобы не тратить ресурсы в режиме чтения */
  enabled: boolean;
}

export interface StudioModeState {
  state: 'prep' | 'live' | 'paused';
  session: ReturnType<typeof useReadingSession>['session'];
  micMuted: boolean;
  setMicMuted: (v: boolean) => void;
  isStartingBroadcast: boolean;
  streamStartError: string | null;
  microphoneIssue: string | null;
  micCheckPassed: boolean;
  setMicCheckPassed: (v: boolean) => void;
  showMicCheck: boolean;
  setShowMicCheck: (v: boolean) => void;
  microphoneAvailable: boolean;
  microphoneLoading: boolean;
  microphoneError: string | null;
  retryDetection: () => Promise<boolean>;
  micLevel: number;
  micBars: ReadonlyArray<number>;
  listenerCount: number;
  elapsedTime: number;
  handleStartBroadcast: (onAnnounce: (sessionId: string) => void) => Promise<void>;
  handlePause: () => void;
  handleResume: () => void;
  handleEnd: (onAnnounceEnd: (sessionId: string) => void) => void;
  openMicCheck: () => void;
}

export function useStudioMode({
  clubId,
  bookId,
  currentChapter,
  readerName: _readerName,
  userId,
  enabled,
}: Readonly<UseStudioModeOptions>): StudioModeState {
  const [micMuted, setMicMuted] = useState(false);
  const [isStartingBroadcast, setIsStartingBroadcast] = useState(false);
  const [streamStartError, setStreamStartError] = useState<string | null>(null);
  const [microphoneIssue, setMicrophoneIssue] = useState<string | null>(null);
  const [micCheckPassed, setMicCheckPassed] = useState(false);
  const [showMicCheck, setShowMicCheck] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const initRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startLockRef = useRef(false);

  const { session, createSession, startReading, pauseReading, resumeReading, endReading } =
    useReadingSession();

  // Ref-обёртка для нестабильной функции — не вызывает перезапуск эффекта
  const createSessionRef = useRef(createSession);
  createSessionRef.current = createSession;

  const {
    isAvailable: microphoneAvailable,
    isLoading: microphoneLoading,
    error: microphoneError,
    retryDetection,
  } = useMicrophoneDetection();

  const {
    listenerCount: sessionListenerCount,
    notifyBroadcastStarted,
    notifyBroadcastEnded,
    notifyBroadcastPaused,
    notifyBroadcastResumed,
    joinSessionRoom,
  } = useAudioSession({ userId });

  const {
    status: audioStatus,
    mediaStream,
    start: startAudioStream,
    stop: stopAudioStream,
    pause: pauseAudioStream,
    resume: resumeAudioStream,
    mute: muteAudioStream,
  } = useAudioStream({
    sessionId: session.sessionId ?? null,
    enableRecording: false,
    onError: (msg, source) => {
      if (source === 'microphone') {
        setMicrophoneIssue(msg);
      } else {
        setStreamStartError(msg);
      }
    },
  });

  const isStreaming = audioStatus === 'streaming' || audioStatus === 'paused';

  const { level: micLevel, bars: micBars } = useRealVUMeter({
    stream: mediaStream,
    isActive: !micMuted && Boolean(mediaStream),
  });

  // ── Кэш проверки микрофона ─────────────────────────────────────────────
  // Используем кэш только если микрофон реально доступен прямо сейчас.
  useEffect(() => {
    if (!enabled) return;

    if (!microphoneAvailable) {
      setMicCheckPassed(false);
      setShowMicCheck(true);
      sessionStorage.removeItem('mic_check_passed');
      return;
    }

    const cached = sessionStorage.getItem('mic_check_passed');
    if (cached) {
      const ts = Number.parseInt(cached, 10);
      if (Date.now() - ts < 10 * 60 * 1000) {
        setMicCheckPassed(true);
        setShowMicCheck(false);
        return;
      }
    }

    setMicCheckPassed(false);
    setShowMicCheck(true);
  }, [enabled, microphoneAvailable]);

  // ── Синхронизация mute ─────────────────────────────────────────────────
  useEffect(() => {
    muteAudioStream(micMuted);
  }, [micMuted, muteAudioStream]);

  // ── Остановить поток при завершении сессии ─────────────────────────────
  useEffect(() => {
    if (!session.isLive && isStreaming) stopAudioStream();
  }, [session.isLive, isStreaming, stopAudioStream]);

  // ── Присоединиться к комнате сессии ────────────────────────────────────
  useEffect(() => {
    if (session.sessionId) joinSessionRoom(session.sessionId);
  }, [session.sessionId, joinSessionRoom]);

  // ── Сбросить проверку микрофона при ошибке ─────────────────────────────
  useEffect(() => {
    if (!microphoneIssue) return;
    setMicCheckPassed(false);
    setShowMicCheck(true);
    sessionStorage.removeItem('mic_check_passed');
  }, [microphoneIssue]);

  // Если микрофон отключился/исчез в процессе — блокируем студию до повторной проверки
  useEffect(() => {
    if (!enabled) return;
    if (microphoneLoading) return;
    if (microphoneAvailable) return;

    setMicCheckPassed(false);
    setShowMicCheck(true);
    sessionStorage.removeItem('mic_check_passed');
  }, [enabled, microphoneAvailable, microphoneLoading]);

  // ── Инициализация сессии при открытии студии ───────────────────────────
  useEffect(() => {
    if (!enabled || !userId || isInitialized || !clubId || !bookId) return;

    const init = async () => {
      try {
        await createSessionRef.current({
          clubId,
          bookId,
          title: `Глава ${currentChapter}`,
          description: 'Live чтение',
        });
        setIsInitialized(true);
      } catch {
        initRetryRef.current = setTimeout(() => setIsInitialized(false), 3000);
      }
    };

    init();
    return () => {
      if (initRetryRef.current) clearTimeout(initRetryRef.current);
    };
  }, [enabled, userId, isInitialized, clubId, bookId, currentChapter]);

  // ── Сброс при закрытии студии ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled) setIsInitialized(false);
  }, [enabled]);

  // ── Derived state ──────────────────────────────────────────────────────
  const listenerCount = sessionListenerCount || session.listenerCount;

  let state: 'prep' | 'live' | 'paused';
  if (!session.isLive) state = 'prep';
  else if (session.isPaused) state = 'paused';
  else state = 'live';

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleStartBroadcast = useCallback(
    async (onAnnounce: (sessionId: string) => void) => {
      if (startLockRef.current) return;
      if (!userId) { setStreamStartError('Пользователь не авторизован'); return; }
      if (!session.sessionId) { setStreamStartError('Сессия ещё не создана. Подождите.'); return; }

      const availableNow = await retryDetection();
      if (!availableNow) {
        setMicCheckPassed(false);
        setShowMicCheck(true);
        setStreamStartError(microphoneError ?? 'Микрофон недоступен. Подключите или включите микрофон.');
        return;
      }
      if (!micCheckPassed) {
        setShowMicCheck(true);
        setStreamStartError('Сначала пройдите проверку микрофона');
        return;
      }

      startLockRef.current = true;
      setIsStartingBroadcast(true);
      setStreamStartError(null);
      setMicrophoneIssue(null);

      try {
        await startAudioStream();
        notifyBroadcastStarted(session.sessionId);
        onAnnounce(session.sessionId);
        await startReading();
        setMicMuted(false);
      } catch (err) {
        setStreamStartError(err instanceof Error ? err.message : 'Не удалось начать эфир');
      } finally {
        startLockRef.current = false;
        setIsStartingBroadcast(false);
      }
    },
    [
      userId,
      session.sessionId,
      microphoneError,
      micCheckPassed,
      retryDetection,
      startAudioStream,
      notifyBroadcastStarted,
      startReading,
    ],
  );

  const handlePause = useCallback(() => {
    pauseAudioStream();
    if (session.sessionId) notifyBroadcastPaused(session.sessionId);
    pauseReading();
  }, [pauseAudioStream, session.sessionId, notifyBroadcastPaused, pauseReading]);

  const handleResume = useCallback(() => {
    resumeAudioStream();
    if (session.sessionId) notifyBroadcastResumed(session.sessionId);
    resumeReading();
  }, [resumeAudioStream, session.sessionId, notifyBroadcastResumed, resumeReading]);

  const handleEnd = useCallback(
    (onAnnounceEnd: (sessionId: string) => void) => {
      stopAudioStream();
      if (session.sessionId) {
        notifyBroadcastEnded(session.sessionId);
        onAnnounceEnd(session.sessionId);
      }
      endReading();
    },
    [stopAudioStream, session.sessionId, notifyBroadcastEnded, endReading],
  );

  const openMicCheck = useCallback(() => {
    setShowMicCheck(true);
    setMicCheckPassed(false);
  }, []);

  return {
    state,
    session,
    micMuted,
    setMicMuted,
    isStartingBroadcast,
    streamStartError,
    microphoneIssue,
    micCheckPassed,
    setMicCheckPassed,
    showMicCheck,
    setShowMicCheck,
    microphoneAvailable,
    microphoneLoading,
    microphoneError,
    retryDetection,
    micLevel,
    micBars,
    listenerCount,
    elapsedTime: session.elapsedTime,
    handleStartBroadcast,
    handlePause,
    handleResume,
    handleEnd,
    openMicCheck,
  };
}
