import { Router, Request, Response } from 'express';
import { storage, repositories } from '../repositories/index.js';
import { logger } from '../lib/logger.js';

const router = Router();
const readingSessionStatuses = ['active', 'paused', 'completed', 'cancelled'] as const;
type ReadingSessionStatus = typeof readingSessionStatuses[number];

function isReadingSessionStatus(value: string): value is ReadingSessionStatus {
  return readingSessionStatuses.includes(value as ReadingSessionStatus);
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

    // Проверяем, что пользователь является членом клуба
    const membership = await storage.getUserClubMembership(clubId, userId);
    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this club',
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

    const updatedSession = await storage.readingSessions.updateSessionStatus(sessionId, status);

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
 * Обновить количество слушателей
 */
router.put('/:sessionId/listeners', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { count } = req.body;

    if (typeof count !== 'number' || count < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid listener count',
      });
    }

    const updatedSession = await storage.readingSessions.updateListenerCount(sessionId, count);

    res.json({
      success: true,
      session: updatedSession,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating listener count: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update listener count',
    });
  }
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

    // Добавляем слушателя
    await storage.readingSessions.addSessionListener(sessionId, userId);

    // Обновляем количество слушателей
    const listenerCount = await storage.readingSessions.getSessionListenerCount(sessionId);
    await storage.readingSessions.updateListenerCount(sessionId, listenerCount);

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

export default router;
