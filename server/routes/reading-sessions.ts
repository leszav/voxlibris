import { Router, Request, Response } from 'express';
import { storage, repositories } from '../repositories/index.js';
import { logger } from '../lib/logger.js';
import { setStudioStreamClosureIntent } from '../lib/studio-stream-intent-store.js';
import { sessionAnalyticsService } from '../services/session-analytics-service.js';
import { activityService } from '../services/activity-service.js';
import { gamificationService } from '../services/gamification-service.js';
import { emotionalMapService } from '../services/emotional-map-service.js';
import { isReaderLedClub } from '../lib/reader-club-access.js';
import { CommerceService } from '../services/monetization.js';

const router = Router();
const readingSessionStatuses = ['active', 'paused', 'completed', 'cancelled'] as const;
type ReadingSessionStatus = typeof readingSessionStatuses[number];

function isReadingSessionStatus(value: string): value is ReadingSessionStatus {
  return readingSessionStatuses.includes(value as ReadingSessionStatus);
}

async function canListenReaderClub(clubId: string, userId: string) {
  const club = await storage.getClub(clubId);
  if (!club || !isReaderLedClub(club) || club.ownerId === userId) return true;
  return new CommerceService().hasEntitlement(userId, 'reader_club', club.id, 'reader_club_access');
}

/**
 * POST /api/reading-sessions
 * Создать новую сессию чтения
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { clubId, bookId, chapter } = req.body;

    if (!clubId || !bookId || !chapter) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: clubId, bookId, chapter',
      });
    }

    const club = await storage.getClub(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        error: 'Club not found',
      });
    }

    // Проверяем, что пользователь является активным членом клуба
    const membership = await storage.getUserClubMembership(clubId, userId);
    if (!membership?.isActive) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this club',
      });
    }

    if (isReaderLedClub(club) && club.ownerId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the reader club owner can start Studio',
      });
    }

    // Проверяем, существует ли книга
    const book = await storage.getBook(bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'Book not found',
      });
    }

    // Создаем сессию чтения
    const session = await storage.readingSessions.createSession({
      clubId,
      bookId,
      userId,
      title: book.title,
      chapter,
      status: 'active',
    });
    if (!session) {
      logger.error('Failed to create reading session: session not returned');
      return res.status(500).json({
        success: false,
        error: 'Failed to create reading session',
      });
    }

    // Создаем статус чтения
    await repositories.clubReadingStatus.createReadingStatus({
      userId,
      bookId,
      clubId,
      sessionId: session.id,
      sessionType: 'reader_club',
      isOpenForListeners: true,
    });

    const existingAnalytics = await sessionAnalyticsService.getSessionAnalytics(session.id);
    if (!existingAnalytics) {
      await sessionAnalyticsService.initializeSessionAnalytics(session.id);
    }

    // Событие ленты: чтец начал сессию
    activityService.emit({
      actorId: userId,
      eventType: 'session_started',
      targetType: 'session',
      targetId: session.id,
      metadata: {
        sessionId: session.id,
        bookId,
        clubId,
        chapter,
        sessionTitle: session.title ?? book.title,
        bookTitle: book.title,
      },
    }).catch((err) => logger.warn('[activity] session_started emit failed', err));

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error creating reading session: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to create reading session',
    });
  }
});

/**
 * GET /api/reading-sessions/:sessionId/emotional-map
 * Получить эмоциональную карту сессии по timestamped reactions.
 */
router.get('/:sessionId/emotional-map', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const map = await emotionalMapService.buildMap(sessionId, req.query.windowSizeMs);

    if (!map) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    return res.json({ success: true, map });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting emotional map: ${errorMessage}`);
    return res.status(500).json({ success: false, error: 'Failed to get emotional map' });
  }
});

/**
 * GET /api/reading-sessions/:sessionId/highlights
 * Получить топ эмоциональных моментов сессии.
 */
router.get('/:sessionId/highlights', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const highlights = await emotionalMapService.getHighlights(sessionId);

    if (!highlights) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    return res.json({ success: true, highlights });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting emotional map highlights: ${errorMessage}`);
    return res.status(500).json({ success: false, error: 'Failed to get emotional map highlights' });
  }
});

/**
 * GET /api/reading-sessions/:sessionId
 * Получить сессию чтения
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await storage.readingSessions.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting reading session: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get reading session',
    });
  }
});

/**
 * GET /api/reading-sessions/club/:clubId
 * Получить сессии чтения клуба
 */
router.get('/club/:clubId', async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const { status } = req.query;

    let sessions;
    if (status && typeof status === 'string') {
      if (!isReadingSessionStatus(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status. Must be: active, paused, completed, cancelled',
        });
      }
      sessions = await storage.readingSessions.getClubSessionsByStatus(clubId, status);
    } else {
      sessions = await storage.readingSessions.getClubSessions(clubId);
    }

    res.json({
      success: true,
      sessions,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting club reading sessions: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get club reading sessions',
    });
  }
});

/**
 * GET /api/reading-sessions/book/:bookId
 * Получить сессии чтения книги
 */
router.get('/book/:bookId', async (req: Request, res: Response) => {
  try {
    const { bookId } = req.params;

    const sessions = await storage.readingSessions.getBookSessions(bookId);

    res.json({
      success: true,
      sessions,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting book reading sessions: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get book reading sessions',
    });
  }
});

/**
 * GET /api/reading-sessions/active/:userId
 * Получить активную сессию чтения пользователя
 */
router.get('/active/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const session = await storage.readingSessions.getUserActiveSession(userId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'No active session found',
      });
    }

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting active reading session: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get active reading session',
    });
  }
});

/**
 * PUT /api/reading-sessions/:sessionId/status
 * Обновить статус сессии
 */
router.put('/:sessionId/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { sessionId } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'paused', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: active, paused, completed, cancelled',
      });
    }

    // Проверяем, что пользователь является создателем сессии
    const session = await storage.readingSessions.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the session creator can update the status',
      });
    }

    if (status === 'paused') {
      await setStudioStreamClosureIntent(sessionId, 'pause');
    }

    const updatedSession = await storage.readingSessions.updateSessionStatus(sessionId, status);

    // Событие ленты при завершении сессии
    if (status === 'completed' || status === 'cancelled') {
      activityService.emit({
        actorId: userId,
        eventType: 'session_ended',
        targetType: 'session',
        targetId: sessionId,
        metadata: {
          sessionId,
          bookId: session.bookId,
          clubId: session.clubId,
          sessionTitle: session.title,
          status,
        },
      }).catch((err) => logger.warn('[activity] session_ended emit failed', err));
    }

    res.json({
      success: true,
      session: updatedSession,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating reading session status: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update reading session status',
    });
  }
});

/**
 * PUT /api/reading-sessions/:sessionId/position
 * Обновить позицию чтения
 */
router.put('/:sessionId/position', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { sessionId } = req.params;
    const { position, chapter } = req.body;

    // Проверяем, что пользователь является создателем сессии
    const session = await storage.readingSessions.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the session creator can update the position',
      });
    }

    const updatedSession = await storage.readingSessions.updateSessionPosition(
      sessionId,
      position || session.position,
      chapter || session.chapter
    );

    res.json({
      success: true,
      session: updatedSession,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating reading session position: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update reading session position',
    });
  }
});

/**
 * PUT /api/reading-sessions/:sessionId/listeners
 * Deprecated: listener count is updated only by server-side websocket flows.
 */
router.put('/:sessionId/listeners', async (req: Request, res: Response) => {
  logger.warn(
    {
      userId: req.user?.id || req.user?.userId || null,
      sessionId: req.params.sessionId,
    },
    'Blocked deprecated listeners update endpoint',
  );

  return res.status(410).json({
    success: false,
    error: 'Listener count updates are server-managed',
  });
});

/**
 * POST /api/reading-sessions/:sessionId/join
 * Присоединиться к сессии чтения (как слушатель)
 */
router.post('/:sessionId/join', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { sessionId } = req.params;

    const session = await storage.readingSessions.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (session.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot join a non-active session',
      });
    }

    // Проверяем, что пользователь является членом клуба
    const membership = await storage.getUserClubMembership(session.clubId, userId);
    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this club',
      });
    }

    if (!await canListenReaderClub(session.clubId, userId)) {
      return res.status(403).json({
        success: false,
        error: 'Reader club access required',
        code: 'READER_CLUB_ACCESS_REQUIRED',
        feature: 'reader_club_access',
      });
    }

    // Добавляем слушателя
    await storage.readingSessions.addSessionListener(sessionId, userId);
    await sessionAnalyticsService.trackListenerJoin(
      sessionId,
      userId,
      req.ip,
      req.get('user-agent')
    );

    // Обновляем количество слушателей
    const listenerCount = await storage.readingSessions.getSessionListenerCount(sessionId);
    await storage.readingSessions.updateListenerCount(sessionId, listenerCount);

    gamificationService.recordUserActivityAndAward(userId, 'session_join_http').catch((err) => {
      logger.warn({ err, userId, sessionId }, '[gamification] session join http sync failed');
    });

    res.json({
      success: true,
      message: 'Joined session successfully',
      listenerCount,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error joining reading session: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to join reading session',
    });
  }
});

/**
 * POST /api/reading-sessions/:sessionId/leave
 * Покинуть сессию чтения
 */
router.post('/:sessionId/leave', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { sessionId } = req.params;

    // Удаляем слушателя
    await storage.readingSessions.removeSessionListener(sessionId, userId);
    await sessionAnalyticsService.trackListenerLeave(sessionId, userId);

    // Обновляем количество слушателей
    const listenerCount = await storage.readingSessions.getSessionListenerCount(sessionId);
    await storage.readingSessions.updateListenerCount(sessionId, listenerCount);

    res.json({
      success: true,
      message: 'Left session successfully',
      listenerCount,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error leaving reading session: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to leave reading session',
    });
  }
});

/**
 * DELETE /api/reading-sessions/:sessionId
 * Завершить сессию чтения
 */
router.delete('/:sessionId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { sessionId } = req.params;

    // Проверяем, что пользователь является создателем сессии
    const session = await storage.readingSessions.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the session creator can end the session',
      });
    }

    // Завершаем сессию
    await storage.readingSessions.endSession(sessionId);

    // Останавливаем статус чтения
    const activeStatus = await repositories.clubReadingStatus.getUserReadingStatusInClub(session.clubId, userId);
    if (activeStatus) {
      await repositories.clubReadingStatus.stopReading(activeStatus.id);
    }

    res.json({
      success: true,
      message: 'Session ended successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error ending reading session: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to end reading session',
    });
  }
});

/**
 * GET /api/reading-sessions/:sessionId/listeners
 * Список активных слушателей сессии (аватары для UI плеера)
 */
router.get('/:sessionId/listeners', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const listeners = await storage.readingSessions.getSessionListeners(sessionId);
    return res.json({ listeners });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting session listeners: ${errorMessage}`);
    return res.status(500).json({ error: 'Failed to get session listeners' });
  }
});

export default router;
