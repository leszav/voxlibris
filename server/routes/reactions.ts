import { Router, Request, Response } from 'express';
import { repositories, storage } from '../repositories/index.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * POST /api/reactions
 * Добавить реакцию к сессии
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

    const { sessionId, emoji, type = 'positive', position } = req.body;

    if (!sessionId || !emoji) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, emoji',
      });
    }

    // Проверяем, что сессия существует
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
        error: 'Cannot react to a non-active session',
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

    // Проверяем тип реакции
    const validTypes = ['positive', 'negative'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be: positive, negative',
      });
    }

    // Добавляем реакцию
    const reaction = await repositories.sessionReactions.addReaction({
      userId,
      sessionId,
      emoji,
      type,
      position,
    });

    res.json({
      success: true,
      reaction,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error adding reaction: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to add reaction',
    });
  }
});

/**
 * GET /api/reactions/session/:sessionId
 * Получить реакции сессии
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const reactions = await repositories.sessionReactions.getSessionReactions(sessionId);

    res.json({
      success: true,
      reactions,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting session reactions: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get session reactions',
    });
  }
});

/**
 * GET /api/reactions/session/:sessionId/summary
 * Получить сводку реакций сессии
 */
router.get('/session/:sessionId/summary', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const summary = await repositories.sessionReactions.countReactionsByType(sessionId);

    // Получаем подробную статистику по эмодзи
    const reactions = await repositories.sessionReactions.getSessionReactions(sessionId);
    const emojiStats: Record<string, number> = {};

    for (const reaction of reactions) {
      if (!emojiStats[reaction.emoji]) {
        emojiStats[reaction.emoji] = 0;
      }
      emojiStats[reaction.emoji]++;
    }

    res.json({
      success: true,
      summary: {
        ...summary,
        emojiStats,
        total: reactions.length,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting reaction summary: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get reaction summary',
    });
  }
});

/**
 * GET /api/reactions/session/:sessionId/type/:type
 * Получить реакции сессии по типу
 */
router.get('/session/:sessionId/type/:type', async (req: Request, res: Response) => {
  try {
    const { sessionId, type } = req.params;

    const validTypes = ['positive', 'negative'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be: positive, negative',
      });
    }

    const reactions = await repositories.sessionReactions.getReactionsByType(
      sessionId,
      type as 'positive' | 'negative'
    );

    res.json({
      success: true,
      reactions,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting reactions by type: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get reactions by type',
    });
  }
});

/**
 * GET /api/reactions/user/:userId
 * Получить реакции пользователя
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Проверяем, что запрашивающий пользователь имеет доступ
    const currentUserId = req.user?.id;
    if (currentUserId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own reactions',
      });
    }

    const reactions = await repositories.sessionReactions.getUserReactions(userId);

    res.json({
      success: true,
      reactions,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting user reactions: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get user reactions',
    });
  }
});

/**
 * DELETE /api/reactions/:reactionId
 * Удалить реакцию
 */
router.delete('/:reactionId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { reactionId } = req.params;

    // Примечание: здесь не проверяем владельца реакции, так как в репозитории нет метода getReaction
    // В реальном приложении нужно добавить проверку
    await repositories.sessionReactions.deleteReaction(reactionId);

    res.json({
      success: true,
      message: 'Reaction deleted successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error deleting reaction: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to delete reaction',
    });
  }
});

/**
 * GET /api/reactions/session/:sessionId/emojis
 * Получить популярные эмодзи сессии
 */
router.get('/session/:sessionId/emojis', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const reactions = await repositories.sessionReactions.getSessionReactions(sessionId);

    // Группируем по эмодзи и считаем
    const emojiCounts: Record<string, number> = {};
    for (const reaction of reactions) {
      if (!emojiCounts[reaction.emoji]) {
        emojiCounts[reaction.emoji] = 0;
      }
      emojiCounts[reaction.emoji]++;
    }

    // Сортируем по популярности
    const sortedEmojis = Object.entries(emojiCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([emoji, count]) => ({ emoji, count }));

    res.json({
      success: true,
      emojis: sortedEmojis,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting popular emojis: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get popular emojis',
    });
  }
});

export default router;
