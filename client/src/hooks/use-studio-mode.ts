/**
 * useStudioMode — инкапсулирует всю аудио/сессионную логику студии чтеца.
 *
 * Используется внутри ClubReader для режима «читать вслух» без навигации
 * на отдельную страницу.
 */

import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useReadingSession } from './use-reading-session';
import { useAudioSession } from './use-audio-session';
import { useAudioStream } from './use-audio-stream';
import { useRealVUMeter } from './use-real-vu-meter';
import { useMicrophoneDetection } from './use-microphone-detection';
import { clearStudioMicCheckPassed, hasRecentStudioMicCheck, markStudioMicCheckPassed } from '@/lib/studio-mic-check-cache';
import { resolveStudioMicCheckState, resolveStudioStartGuard } from '@/lib/studio-mic-check-state';
import { resolveStudioModeState } from '@/lib/studio-mode-state';
import { resolveStudioSessionPhase, type StudioSessionPhase } from '@/lib/studio-session-phase';
import type { LiveSessionQuestion, LiveSessionReaction } from './use-audio-session';

interface UseStudioModeOptions {
  clubId: string;
  bookId: string;
  currentChapter: number;
  readerName: string;
  userId?: string;
  publicationRecordingAllowed: boolean;
  /** Хук активен только когда enabled=true, чтобы не тратить ресурсы в режиме чтения */
  enabled: boolean;
}

export interface StudioModeState {
  state: 'prep' | 'live' | 'paused';
  phase: StudioSessionPhase;
  session: ReturnType<typeof useReadingSession>['session'];
  micMuted: boolean;
  setMicMuted: (v: boolean) => void;
  isStartingBroadcast: boolean;
  streamStartError: string | null;
  microphoneIssue: string | null;
  micCheckPassed: boolean;
  publicationRecordingEnabled: boolean;
  setPublicationRecordingEnabled: Dispatch<SetStateAction<boolean>>;
  showMicCheck: boolean;
  microphoneAvailable: boolean;
  microphoneLoading: boolean;
  microphoneError: string | null;
  retryDetection: () => Promise<boolean>;
  micLevel: number;
  micBars: ReadonlyArray<number>;
  listenerCount: number;
  elapsedTime: number;
  recentReactions: LiveSessionReaction[];
  reactionCount: number;
  sessionQuestions: LiveSessionQuestion[];
  unansweredQuestionCount: number;
  markQuestionAnswered: (questionId: string) => Promise<void>;
  completeMicCheck: () => void;
  skipMicCheck: () => void;
  handleStartBroadcast: (onAnnounce: (sessionId: string) => void) => Promise<void>;
  handlePause: () => void;
  handleResume: () => void;
  handleEnd: (onAnnounceEnd: (sessionId: string) => void) => void;
  requestEnd: () => void;
  cancelEnd: () => void;
  closeSummary: () => void;
  openMicCheck: () => void;
}

export function useStudioMode({
  clubId,
  bookId,
  currentChapter,
  readerName: _readerName,
  userId,
  publicationRecordingAllowed,
  enabled,
}: Readonly<UseStudioModeOptions>): StudioModeState {
  const [micMuted, setMicMuted] = useState(false);
  const [isStartingBroadcast, setIsStartingBroadcast] = useState(false);
  const [streamStartError, setStreamStartError] = useState<string | null>(null);
  const [microphoneIssue, setMicrophoneIssue] = useState<string | null>(null);
  const [micCheckPassed, setMicCheckPassed] = useState(false);
  const [showMicCheck, setShowMicCheck] = useState(true);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [publicationRecordingEnabled, setPublicationRecordingEnabled] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const initRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startLockRef = useRef(false);
  const awaitingSessionLiveSyncRef = useRef(false);
  const resourcesActivatedRef = useRef(enabled);

  if (enabled) {
    resourcesActivatedRef.current = true;
  }

  const resourcesEnabled = enabled || resourcesActivatedRef.current;

  const { session, createSession, startReading, pauseReading, resumeReading, endReading } =
    useReadingSession(resourcesEnabled);

  // Ref-обёртка для нестабильной функции — не вызывает перезапуск эффекта
  const createSessionRef = useRef(createSession);
  createSessionRef.current = createSession;

  const {
    isAvailable: microphoneAvailable,
    isLoading: microphoneLoading,
    error: microphoneError,
    retryDetection,
  } = useMicrophoneDetection(resourcesEnabled);

  const {
    listenerCount: sessionListenerCount,
    notifyBroadcastStarted,
    notifyBroadcastEnded,
    notifyBroadcastPaused,
    notifyBroadcastResumed,
    joinSessionRoom,
    recentReactions,
    reactionCount,
    sessionQuestions,
    unansweredQuestionCount,
    markQuestionAnswered,
  } = useAudioSession({ userId, enabled: resourcesEnabled });

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
    enableRecording: publicationRecordingAllowed && publicationRecordingEnabled,
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

    const nextMicCheckState = resolveStudioMicCheckState({
      microphoneAvailable,
      hasRecentMicCheck: hasRecentStudioMicCheck(),
    });

    setMicCheckPassed(nextMicCheckState.micCheckPassed);
    setShowMicCheck(nextMicCheckState.showMicCheck);

    if (nextMicCheckState.shouldClearCache) {
      clearStudioMicCheckPassed();
    }
  }, [enabled, microphoneAvailable]);

  useEffect(() => {
    if (!publicationRecordingAllowed && publicationRecordingEnabled) {
      setPublicationRecordingEnabled(false);
    }
  }, [publicationRecordingAllowed, publicationRecordingEnabled]);

  // ── Синхронизация mute ─────────────────────────────────────────────────
  useEffect(() => {
    muteAudioStream(micMuted);
  }, [micMuted, muteAudioStream]);

  // ── Остановить поток при завершении сессии ─────────────────────────────
  useEffect(() => {
    if (session.isLive || !isStreaming) {
      awaitingSessionLiveSyncRef.current = false;
      return;
    }

    // Во время стартового handshake mount уже может подняться,
    // а session.isLive обновится чуть позже отдельным /start-запросом.
    // В это окно нельзя автоостанавливать ingest, иначе эфир сам себя гасит.
    if (isStartingBroadcast || awaitingSessionLiveSyncRef.current) {
      return;
    }

    stopAudioStream();
  }, [session.isLive, isStreaming, isStartingBroadcast, stopAudioStream]);

  // ── Присоединиться к комнате сессии ────────────────────────────────────
  useEffect(() => {
    if (session.sessionId) joinSessionRoom(session.sessionId);
  }, [session.sessionId, joinSessionRoom]);

  // ── Сбросить проверку микрофона при ошибке ─────────────────────────────
  useEffect(() => {
    if (!microphoneIssue) return;
    setMicCheckPassed(false);
    setShowMicCheck(true);
    clearStudioMicCheckPassed();
  }, [microphoneIssue]);

  // Если микрофон отключился/исчез в процессе — блокируем студию до повторной проверки
  useEffect(() => {
    if (!enabled) return;
    if (microphoneLoading) return;
    if (microphoneAvailable) return;

    setMicCheckPassed(false);
    setShowMicCheck(true);
    clearStudioMicCheckPassed();
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
  const { state, listenerCount } = resolveStudioModeState({
    sessionIsLive: session.isLive,
    sessionIsPaused: session.isPaused,
    sessionListenerCount,
    fallbackListenerCount: session.listenerCount,
  });
  const phase = resolveStudioSessionPhase({
    state,
    showEndConfirm,
    showSummary,
  });

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleStartBroadcast = useCallback(
    async (onAnnounce: (sessionId: string) => void) => {
      if (startLockRef.current) return;

      const availableNow = await retryDetection();

      const startGuard = resolveStudioStartGuard({
        userId,
        sessionId: session.sessionId ?? null,
        availableNow,
        microphoneError,
        micCheckPassed,
      });

      if (!startGuard.canStart) {
        if (startGuard.shouldResetMicCheck) {
          setMicCheckPassed(false);
        }
        if (startGuard.shouldShowMicCheck) {
          setShowMicCheck(true);
        }
        if (startGuard.errorMessage) {
          setStreamStartError(startGuard.errorMessage);
        }
        return;
      }

      const sessionId = session.sessionId;
      if (!sessionId) {
        setStreamStartError('Сессия ещё не создана. Подождите.');
        return;
      }

      startLockRef.current = true;
      awaitingSessionLiveSyncRef.current = true;
      setIsStartingBroadcast(true);
      setStreamStartError(null);
      setMicrophoneIssue(null);

      try {
        await startAudioStream();
        notifyBroadcastStarted(sessionId);
        onAnnounce(sessionId);
        await startReading();
        setMicMuted(false);
        setShowSummary(false);
        setShowEndConfirm(false);
      } catch (err) {
        awaitingSessionLiveSyncRef.current = false;
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
    if (session.sessionId) {
      void apiRequest(`/api/reading-sessions/${session.sessionId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'paused' }),
      }).catch(() => {
        // Локальное paused-состояние уже применено; статус дотянем при следующем действии.
      });
    }
    pauseReading();
  }, [pauseAudioStream, session.sessionId, notifyBroadcastPaused, pauseReading]);

  const handleResume = useCallback(() => {
    if (!session.sessionId) {
      return;
    }

    resumeAudioStream();
    if (session.sessionId) notifyBroadcastResumed(session.sessionId);
    if (session.sessionId) {
      void apiRequest(`/api/sessions/${session.sessionId}/start`, {
        method: 'PUT',
      }).catch(() => {
        // UI уже вернулся в live; серверный статус переподтянется следующими обновлениями.
      });
    }
    resumeReading();
  }, [resumeAudioStream, session.sessionId, notifyBroadcastResumed, resumeReading]);

  const handleEnd = useCallback(
    async (onAnnounceEnd: (sessionId: string) => void) => {
      const sessionId = session.sessionId;
      if (sessionId) {
        await endReading();
        stopAudioStream();
        notifyBroadcastEnded(sessionId);
        onAnnounceEnd(sessionId);
      } else {
        stopAudioStream();
      }
      setShowEndConfirm(false);
      setShowSummary(true);
    },
    [stopAudioStream, session.sessionId, notifyBroadcastEnded, endReading],
  );

  const requestEnd = useCallback(() => {
    setShowEndConfirm(true);
  }, []);

  const cancelEnd = useCallback(() => {
    setShowEndConfirm(false);
  }, []);

  const closeSummary = useCallback(() => {
    setShowSummary(false);
  }, []);

  const completeMicCheck = useCallback(() => {
    setMicCheckPassed(true);
    setShowMicCheck(false);
    setMicrophoneIssue(null);
    clearStudioMicCheckPassed();
    markStudioMicCheckPassed();
  }, []);

  const skipMicCheck = useCallback(() => {
    setMicCheckPassed(false);
    setShowMicCheck(false);
    clearStudioMicCheckPassed();
  }, []);

  const openMicCheck = useCallback(() => {
    setShowMicCheck(true);
    setMicCheckPassed(false);
  }, []);

  return {
    state,
    phase,
    session,
    micMuted,
    setMicMuted,
    isStartingBroadcast,
    streamStartError,
    microphoneIssue,
    micCheckPassed,
    publicationRecordingEnabled,
    setPublicationRecordingEnabled,
    showMicCheck,
    microphoneAvailable,
    microphoneLoading,
    microphoneError,
    retryDetection,
    micLevel,
    micBars,
    listenerCount,
    elapsedTime: session.elapsedTime,
    recentReactions,
    reactionCount,
    sessionQuestions,
    unansweredQuestionCount,
    markQuestionAnswered,
    completeMicCheck,
    skipMicCheck,
    handleStartBroadcast,
    handlePause,
    handleResume,
    handleEnd,
    requestEnd,
    cancelEnd,
    closeSummary,
    openMicCheck,
  };
}
