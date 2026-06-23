import { Server as SocketIOServer, Socket, Namespace } from 'socket.io';
import { storage, repositories } from '../repositories/index.js';
import { logger } from '../lib/logger.js';
import { authService } from '../auth-service.js';
import { sessionAnalyticsService } from '../services/session-analytics-service.js';
import { gamificationService } from '../services/gamification-service.js';
import { canClubMemberWrite } from '../lib/club-member-moderation.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

const readingSessionStatuses = ['active', 'paused', 'completed', 'cancelled'] as const;
type ReadingSessionStatus = typeof readingSessionStatuses[number];

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

/**
 * WebSocket обработчики для сессий чтения
 */
export function setupReadingSessionsHandlers(_io: SocketIOServer, namespace: Namespace) {
  namespace.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const auth = socket.handshake.auth as Record<string, unknown> | undefined;
      const authToken = typeof auth?.token === 'string' ? auth.token : undefined;
      const headerToken = socket.handshake.headers.authorization?.replace('Bearer ', '');
      const cookieToken = /(?:^|;\s*)accessToken=([^;]+)/.exec(socket.handshake.headers.cookie ?? '')?.[1];
      const token = authToken || headerToken || cookieToken;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = authService.verifyAccessToken(token);
      if (!payload?.userId) {
        return next(new Error('Invalid token'));
      }

      const user = await storage.getUser(payload.userId);
      if (user?.status !== 'active') {
        return next(new Error('User not allowed'));
      }

      if (!user.emailConfirmed) {
        await storage.updateUserEmailConfirmation(user.id, true);
      }

      socket.userId = payload.userId;
      next();
    } catch (error) {
      const errorMessage = formatUnknownError(error);
      logger.error({ error: errorMessage }, 'Reading sessions websocket authentication error');
      next(new Error('Authentication failed'));
    }
  });

  namespace.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId;
    if (!userId) {
      socket.disconnect();
      return;
    }

    logger.info(`User ${userId} connected to reading sessions namespace`);

    /**
     * Присоединиться к сессии чтения
     */
    socket.on('reading-session:join', async (sessionId: string) => {
      try {
        const session = await storage.readingSessions.getSession(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        if (session.status !== 'active') {
          socket.emit('error', { message: 'Session is not active' });
          return;
        }

        // Присоединяем к комнате сессии
        socket.join(`session:${sessionId}`);

        // Добавляем слушателя
        await storage.readingSessions.addSessionListener(sessionId, userId);
        await sessionAnalyticsService.trackListenerJoin(
          sessionId,
          userId,
          socket.handshake.address,
          socket.handshake.headers['user-agent']
        );

        // Обновляем количество слушателей
        const listenerCount = await storage.readingSessions.getSessionListenerCount(sessionId);
        await storage.readingSessions.updateListenerCount(sessionId, listenerCount);

        gamificationService.recordUserActivityAndAward(userId, 'session_join_socket').catch((err) => {
          logger.warn({ err, userId, sessionId }, '[gamification] session join socket sync failed');
        });

        // Уведомляем всех в комнате
        namespace.to(`session:${sessionId}`).emit('reading-session:listener-joined', {
          sessionId,
          userId,
          listenerCount,
        });

        socket.emit('reading-session:joined', {
          sessionId,
          listenerCount,
        });

        logger.info(`User ${userId} joined reading session ${sessionId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error joining reading session: ${errorMessage}`);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    /**
     * Покинуть сессию чтения
     */
    socket.on('reading-session:leave', async (sessionId: string) => {
      try {
        // Удаляем слушателя
        await storage.readingSessions.removeSessionListener(sessionId, userId);
        await sessionAnalyticsService.trackListenerLeave(sessionId, userId);

        // Обновляем количество слушателей
        const listenerCount = await storage.readingSessions.getSessionListenerCount(sessionId);
        await storage.readingSessions.updateListenerCount(sessionId, listenerCount);

        // Покидаем комнату сессии
        socket.leave(`session:${sessionId}`);

        // Уведомляем всех в комнате
        namespace.to(`session:${sessionId}`).emit('reading-session:listener-left', {
          sessionId,
          userId,
          listenerCount,
        });

        socket.emit('reading-session:left', {
          sessionId,
          listenerCount,
        });

        logger.info(`User ${userId} left reading session ${sessionId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error leaving reading session: ${errorMessage}`);
        socket.emit('error', { message: 'Failed to leave session' });
      }
    });

    /**
     * Обновить статус сессии (только для создателя)
     */
    socket.on('reading-session:update-status', async (data: { sessionId: string; status: string }) => {
      try {
        const { sessionId, status } = data;

        const session = await storage.readingSessions.getSession(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        if (session.userId !== userId) {
          socket.emit('error', { message: 'Only the session creator can update the status' });
          return;
        }

        if (!readingSessionStatuses.includes(status as ReadingSessionStatus)) {
          socket.emit('error', { message: 'Invalid status' });
          return;
        }

        const updatedSession = await storage.readingSessions.updateSessionStatus(
          sessionId,
          status as ReadingSessionStatus
        );
        if (!updatedSession) {
          socket.emit('error', { message: 'Failed to update session status' });
          return;
        }

        const updatedAt =
          updatedSession.endedAt ??
          updatedSession.startedAt ??
          updatedSession.createdAt ??
          new Date();

        // Уведомляем всех в комнате
        namespace.to(`session:${sessionId}`).emit('reading-session:status-updated', {
          sessionId,
          status,
          updatedAt,
        });

        logger.info(`Reading session ${sessionId} status updated to ${status} by user ${userId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error updating reading session status: ${errorMessage}`);
        socket.emit('error', { message: 'Failed to update session status' });
      }
    });

    /**
     * Обновить позицию чтения (только для создателя)
     */
    socket.on('reading-session:update-position', async (data: { sessionId: string; position?: string; chapter?: number }) => {
      try {
        const { sessionId, position, chapter } = data;

        const session = await storage.readingSessions.getSession(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        if (session.userId !== userId) {
          socket.emit('error', { message: 'Only the session creator can update the position' });
          return;
        }

        const updatedSession = await storage.readingSessions.updateSessionPosition(
          sessionId,
          position ?? session.position ?? undefined,
          chapter ?? session.chapter
        );
        if (!updatedSession) {
          socket.emit('error', { message: 'Failed to update session position' });
          return;
        }

        const updatedAt = new Date();

        // Уведомляем всех в комнате
        namespace.to(`session:${sessionId}`).emit('reading-session:position-updated', {
          sessionId,
          position: updatedSession.position,
          chapter: updatedSession.chapter,
          updatedAt,
        });

        logger.info(`Reading session ${sessionId} position updated by user ${userId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error updating reading session position: ${errorMessage}`);
        socket.emit('error', { message: 'Failed to update session position' });
      }
    });

    /**
     * Получить текущую позицию сессии
     */
    socket.on('reading-session:get-position', async (sessionId: string) => {
      try {
        const session = await storage.readingSessions.getSession(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        socket.emit('reading-session:position', {
          sessionId,
          position: session.position,
          chapter: session.chapter,
          status: session.status,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error getting reading session position: ${errorMessage}`);
        socket.emit('error', { message: 'Failed to get session position' });
      }
    });

    /**
     * Получить список слушателей сессии
     */
    socket.on('reading-session:get-listeners', async (sessionId: string) => {
      try {
        const listeners = await storage.readingSessions.getSessionListeners(sessionId);

        socket.emit('reading-session:listeners', {
          sessionId,
          listeners,
          count: listeners.length,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error getting reading session listeners: ${errorMessage}`);
        socket.emit('error', { message: 'Failed to get session listeners' });
      }
    });

    /**
     * Отправить реакцию на сессию
     */
    socket.on('reading-session:reaction', async (data: { sessionId: string; emoji: string; type?: 'positive' | 'negative'; audioTimestampMs?: number; chapterNumber?: number }) => {
      try {
        const { sessionId, emoji, type = 'positive', audioTimestampMs, chapterNumber } = data;

        const hasInvalidAudioTimestamp = audioTimestampMs !== undefined && (!Number.isInteger(audioTimestampMs) || audioTimestampMs < 0);
        const hasInvalidChapterNumber = chapterNumber !== undefined && (!Number.isInteger(chapterNumber) || chapterNumber < 1);
        if (hasInvalidAudioTimestamp || hasInvalidChapterNumber) {
          socket.emit('error', { message: 'Invalid reaction timestamp payload' });
          return;
        }

        if (!sessionId || !emoji || !['positive', 'negative'].includes(type)) {
          socket.emit('error', { message: 'Invalid reaction payload' });
          return;
        }

        const session = await storage.readingSessions.getSession(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        const membership = await storage.getUserClubMembership(session.clubId, userId);
        if (!membership || !canClubMemberWrite(membership)) {
          socket.emit('error', { message: 'Your club write permissions are restricted' });
          return;
        }

        // Добавляем реакцию
        await repositories.sessionReactions.addReaction({
          userId,
          sessionId,
          emoji,
          type,
          audioTimestampMs,
          chapterNumber,
        });
        await sessionAnalyticsService.trackReaction(sessionId, type === 'positive');

        // Уведомляем всех в комнате
        namespace.to(`session:${sessionId}`).emit('reading-session:reaction', {
          sessionId,
          userId,
          emoji,
          type,
          audioTimestampMs,
          chapterNumber,
        });

        logger.info(`User ${userId} sent reaction ${emoji} to session ${sessionId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error sending reaction: ${errorMessage}`);
        socket.emit('error', { message: 'Failed to send reaction' });
      }
    });

    /**
     * Отправить вопрос чтецу
     */
    socket.on('reading-session:question', async (data: { sessionId: string; question: string }) => {
      try {
        const { sessionId, question } = data;

        if (!sessionId || typeof question !== 'string' || question.trim().length === 0 || question.length > 1000) {
          socket.emit('error', { message: 'Invalid question payload' });
          return;
        }

        const session = await storage.readingSessions.getSession(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        if (session.status !== 'active') {
          socket.emit('error', { message: 'Cannot ask a question in a non-active session' });
          return;
        }

        const membership = await storage.getUserClubMembership(session.clubId, userId);
        if (!membership) {
          socket.emit('error', { message: 'You are not a member of this club' });
          return;
        }

        if (!canClubMemberWrite(membership)) {
          socket.emit('error', { message: 'Your club write permissions are restricted' });
          return;
        }

        // Добавляем вопрос
        const createdQuestion = await repositories.sessionQuestions.askQuestion({
          userId,
          sessionId,
          question: question.trim(),
        });
        await sessionAnalyticsService.trackQuestion(sessionId);

        // Уведомляем всех в комнате (особенно чтеца)
        namespace.to(`session:${sessionId}`).emit('reading-session:question', {
          sessionId,
          questionId: createdQuestion.id,
          userId,
          question: createdQuestion.question,
          createdAt: createdQuestion.createdAt,
        });

        logger.info(`User ${userId} asked a question in session ${sessionId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error asking question: ${errorMessage}`);
        socket.emit('error', { message: 'Failed to ask question' });
      }
    });

    /**
     * Ответить на вопрос (только для чтеца)
     */
    socket.on('reading-session:answer-question', async (data: { questionId: string; answer: string }) => {
      try {
        const { questionId, answer } = data;

        const question = await repositories.sessionQuestions.getQuestion(questionId);
        if (!question) {
          socket.emit('error', { message: 'Question not found' });
          return;
        }

        // Проверяем, что пользователь является чтецом (создателем сессии)
        const session = await storage.readingSessions.getSession(question.sessionId);
        if (session?.userId !== userId) {
          socket.emit('error', { message: 'Only the reader can answer questions' });
          return;
        }

        const updatedQuestion = await repositories.sessionQuestions.answerQuestion(questionId, answer);

        // Уведомляем всех в комнате
        namespace.to(`session:${question.sessionId}`).emit('reading-session:question-answered', {
          sessionId: question.sessionId,
          questionId,
          answer,
          answeredAt: updatedQuestion.answeredAt,
        });

        logger.info(`User ${userId} answered question ${questionId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error answering question: ${errorMessage}`);
        socket.emit('error', { message: 'Failed to answer question' });
      }
    });

    /**
     * Обработка отключения
     */
    socket.on('disconnect', async () => {
      logger.info(`User ${userId} disconnected from reading sessions namespace`);

      // Получаем все комнаты, в которых находится сокет
      const rooms = Array.from(socket.rooms).filter(room => room.startsWith('session:'));

      // Удаляем пользователя из всех активных сессий
      for (const room of rooms) {
        const sessionId = room.replace('session:', '');
        try {
          await storage.readingSessions.removeSessionListener(sessionId, userId);

          // Обновляем количество слушателей
          const listenerCount = await storage.readingSessions.getSessionListenerCount(sessionId);
          await storage.readingSessions.updateListenerCount(sessionId, listenerCount);

          // Уведомляем всех в комнате
          namespace.to(`session:${sessionId}`).emit('reading-session:listener-left', {
            sessionId,
            userId,
            listenerCount,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Error removing listener from session ${sessionId}: ${errorMessage}`);
        }
      }
    });
  });

  logger.info('Reading sessions WebSocket handlers initialized');
}
