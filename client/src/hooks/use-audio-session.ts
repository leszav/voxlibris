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
import { apiRequest } from '@/lib/queryClient';

interface AudioSessionOptions {
  userId?: string | null;
  enabled?: boolean;
}

interface AudioSessionStats {
  listenerCount: number;
  duration: number;
}

export interface LiveSessionReaction {
  id: number;
  sourceKey: string;
  sessionId: string;
  userId: string;
  emoji: string;
  type: 'positive' | 'negative';
  audioTimestampMs?: number;
  chapterNumber?: number;
  receivedAt: number;
}

export interface LiveSessionQuestion {
  id: string;
  sessionId: string;
  userId: string;
  question: string;
  answer?: string | null;
  isAnswered: boolean;
  createdAt?: string | Date | null;
  answeredAt?: string | Date | null;
}

interface ReactionPayload {
  sessionId: string;
  userId: string;
  emoji: string;
  type?: 'positive' | 'negative';
  audioTimestampMs?: number;
  chapterNumber?: number;
}

interface SessionReactionResponseItem {
  id: string;
  sessionId: string;
  userId: string;
  emoji: string;
  type?: 'positive' | 'negative';
  audioTimestampMs?: number | null;
  chapterNumber?: number | null;
  createdAt?: string | Date | null;
}

interface SessionReactionsResponse {
  success: boolean;
  reactions: SessionReactionResponseItem[];
}

interface QuestionPayload {
  sessionId: string;
  questionId: string;
  userId: string;
  question: string;
  createdAt?: string | Date | null;
}

interface QuestionAnsweredPayload {
  sessionId: string;
  questionId: string;
  answer: string;
  answeredAt?: string | Date | null;
}

interface SessionQuestionsResponse {
  success: boolean;
  questions: LiveSessionQuestion[];
  count?: number;
}

export function useAudioSession({ userId, enabled = true }: AudioSessionOptions) {
  const [listenerCount, setListenerCount] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats] = useState<AudioSessionStats | null>(null);
  const [recentReactions, setRecentReactions] = useState<LiveSessionReaction[]>([]);
  const [reactionCount, setReactionCount] = useState(0);
  const [sessionQuestions, setSessionQuestions] = useState<LiveSessionQuestion[]>([]);
  const [unansweredQuestionCount, setUnansweredQuestionCount] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const reactionIdRef = useRef(0);
  const activeSessionIdRef = useRef<string | null>(null);
  const seenReactionKeysRef = useRef(new Set<string>());

  const applyUnansweredQuestions = useCallback((questions: LiveSessionQuestion[]): void => {
    setSessionQuestions((current) => {
      const byId = new Map<string, LiveSessionQuestion>();
      for (const item of current) {
        byId.set(item.id, item);
      }
      for (const item of questions) {
        byId.set(item.id, item);
      }

      return Array.from(byId.values())
        .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime())
        .slice(0, 50);
    });
    setUnansweredQuestionCount(questions.filter((question) => !question.isAnswered).length);
  }, []);

  useEffect(() => {
    if (!enabled || !userId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSessionActive(false);
      setListenerCount(0);
      setRecentReactions([]);
      setReactionCount(0);
      setSessionQuestions([]);
      setUnansweredQuestionCount(0);
      activeSessionIdRef.current = null;
      seenReactionKeysRef.current.clear();
      return;
    }

    const token = getAccessToken();
    const socket = io('/reading-sessions', {
      transports: ['websocket'],
      withCredentials: true,
      auth: token ? { token } : undefined,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setError(null);
      if (activeSessionIdRef.current) {
        socket.emit('reading-session:join', activeSessionIdRef.current);
      }
    });

    socket.on('disconnect', () => {
      setError('Соединение с сервером разорвано');
      setSessionActive(false);
    });

    socket.on('reading-session:joined', (data: { listenerCount: number }) => {
      setSessionActive(true);
      setListenerCount(data.listenerCount);
      setError(null);
    });

    socket.on('reading-session:left', (data: { listenerCount: number }) => {
      setListenerCount(data.listenerCount);
    });

    socket.on('reading-session:listener-joined', (data: { listenerCount: number }) => {
      setSessionActive(true);
      setListenerCount(data.listenerCount);
    });

    socket.on('reading-session:listener-left', (data: { listenerCount: number }) => {
      setListenerCount(data.listenerCount);
    });

    socket.on('reading-session:status-updated', (data: { status: string }) => {
      if (data.status === 'completed' || data.status === 'cancelled') {
        setSessionActive(false);
        setListenerCount(0);
        setRecentReactions([]);
        setReactionCount(0);
        setSessionQuestions([]);
        setUnansweredQuestionCount(0);
      }
    });

    socket.on('reading-session:reaction', (data: ReactionPayload) => {
      reactionIdRef.current += 1;
      const sourceKey = `socket:${data.sessionId}:${data.userId}:${data.emoji}:${data.audioTimestampMs ?? 'live'}:${reactionIdRef.current}`;
      seenReactionKeysRef.current.add(sourceKey);
      const reaction: LiveSessionReaction = {
        id: reactionIdRef.current,
        sourceKey,
        sessionId: data.sessionId,
        userId: data.userId,
        emoji: data.emoji,
        type: data.type ?? 'positive',
        audioTimestampMs: data.audioTimestampMs,
        chapterNumber: data.chapterNumber,
        receivedAt: Date.now(),
      };
      setRecentReactions((items) => [...items, reaction].slice(-12));
      setReactionCount((count) => count + 1);
    });

    socket.on('reading-session:question', (data: QuestionPayload) => {
      setSessionQuestions((items) => {
        if (items.some((item) => item.id === data.questionId)) return items;
        const question: LiveSessionQuestion = {
          id: data.questionId,
          sessionId: data.sessionId,
          userId: data.userId,
          question: data.question,
          isAnswered: false,
          createdAt: data.createdAt,
        };
        return [question, ...items].slice(0, 50);
      });
      setUnansweredQuestionCount((count) => count + 1);
    });

    socket.on('reading-session:question-answered', (data: QuestionAnsweredPayload) => {
      setSessionQuestions((items) => items.map((item) => (
        item.id === data.questionId
          ? { ...item, answer: data.answer, answeredAt: data.answeredAt, isAnswered: true }
          : item
      )));
      setUnansweredQuestionCount((count) => Math.max(0, count - 1));
    });

    socket.on('error', (data: { message?: string }) => {
      setError(data.message ?? 'Ошибка сессии');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyUnansweredQuestions, enabled, userId]);

  useEffect(() => {
    if (!enabled || !userId) return;

    let cancelled = false;

    const syncRecentReactions = async () => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) return;

      try {
        const response = await apiRequest<SessionReactionsResponse>(`/api/reactions/session/${sessionId}`);
        if (cancelled) return;

        const nextReactions = response.reactions
          .slice(0, 8)
          .reverse()
          .filter((reaction) => !seenReactionKeysRef.current.has(`rest:${reaction.id}`));

        if (nextReactions.length === 0) return;

        const mapped = nextReactions.map((reaction) => {
          reactionIdRef.current += 1;
          const sourceKey = `rest:${reaction.id}`;
          seenReactionKeysRef.current.add(sourceKey);
          return {
            id: reactionIdRef.current,
            sourceKey,
            sessionId: reaction.sessionId,
            userId: reaction.userId,
            emoji: reaction.emoji,
            type: reaction.type ?? 'positive',
            audioTimestampMs: reaction.audioTimestampMs ?? undefined,
            chapterNumber: reaction.chapterNumber ?? undefined,
            receivedAt: reaction.createdAt ? new Date(reaction.createdAt).getTime() : Date.now(),
          } satisfies LiveSessionReaction;
        });

        setRecentReactions((items) => [...items, ...mapped].slice(-12));
        setReactionCount((count) => count + mapped.length);
      } catch {
        // Realtime остаётся основным каналом; polling — тихий fallback для live-индикатора.
      }
    };

    void syncRecentReactions();
    const timer = globalThis.setInterval(() => {
      void syncRecentReactions();
    }, 2000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [enabled, userId]);

  useEffect(() => {
    if (!enabled || !userId) return;

    let cancelled = false;

    const syncUnansweredQuestions = async () => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) return;

      try {
        const response = await apiRequest<SessionQuestionsResponse>(`/api/questions/session/${sessionId}/unanswered`);
        if (cancelled) return;
        applyUnansweredQuestions(response.questions ?? []);
      } catch {
        // Realtime остаётся быстрым каналом; REST-sync нужен, чтобы Studio не теряла вопросы при reconnect/socket-сбоях.
      }
    };

    void syncUnansweredQuestions();
    const timer = globalThis.setInterval(() => {
      void syncUnansweredQuestions();
    }, 2000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [applyUnansweredQuestions, enabled, userId]);

  const joinSessionRoom = useCallback((sessionId: string): void => {
    activeSessionIdRef.current = sessionId;
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('reading-session:join', sessionId);
  }, []);

  const leaveSessionRoom = useCallback((sessionId: string): void => {
    if (activeSessionIdRef.current === sessionId) {
      activeSessionIdRef.current = null;
    }
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('reading-session:leave', sessionId);
  }, []);

  const notifyBroadcastStarted = useCallback((sessionId: string): void => {
    setSessionActive(true);
    setReactionCount(0);
    setRecentReactions([]);
    setSessionQuestions([]);
    setUnansweredQuestionCount(0);
    seenReactionKeysRef.current.clear();
    joinSessionRoom(sessionId);
  }, [joinSessionRoom]);

  const notifyBroadcastEnded = useCallback((sessionId: string): void => {
    leaveSessionRoom(sessionId);
    setSessionActive(false);
    setListenerCount(0);
    setRecentReactions([]);
    setReactionCount(0);
    setSessionQuestions([]);
    setUnansweredQuestionCount(0);
    seenReactionKeysRef.current.clear();
  }, [leaveSessionRoom]);

  const markQuestionAnswered = useCallback(async (questionId: string): Promise<void> => {
    await apiRequest(`/api/questions/${questionId}/answer`, {
      method: 'PUT',
      body: JSON.stringify({ answer: 'Ответ дан устно во время эфира' }),
    });

    const answeredAt = new Date().toISOString();
    setSessionQuestions((items) => items.map((item) => (
      item.id === questionId
        ? { ...item, answer: 'Ответ дан устно во время эфира', answeredAt, isAnswered: true }
        : item
    )));
    setUnansweredQuestionCount((count) => Math.max(0, count - 1));
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
    recentReactions,
    reactionCount,
    sessionQuestions,
    unansweredQuestionCount,
    markQuestionAnswered,
    joinSessionRoom,
    leaveSessionRoom,
    notifyBroadcastStarted,
    notifyBroadcastEnded,
    notifyBroadcastPaused,
    notifyBroadcastResumed,
  };
}
