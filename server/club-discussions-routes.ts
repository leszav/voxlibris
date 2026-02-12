import { Router, Request, Response } from 'express';
import { jwtAuth, requireActiveUser } from './jwt-middleware.js';
import { storage } from './repositories/index.js';
import { logger } from './lib/logger.js';

const router = Router();

/**
 * GET /api/clubs/:clubId/discussions
 * Получить все обсуждения клуба (с лимитом 500 последних сообщений)
 */
router.get('/clubs/:clubId/discussions', jwtAuth, async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Проверяем, является ли пользователь членом клуба
    const membership = await storage.getUserClubMembership(clubId, req.user.userId);
    if (!membership) {
      return res.status(403).json({ message: 'You must be a club member to view discussions' });
    }

    const discussions = await storage.getClubDiscussions(clubId);
    res.json(discussions);
  } catch (error) {
    logger.error({ error }, 'Error fetching club discussions');
    res.status(500).json({ message: 'Failed to fetch discussions' });
  }
});

/**
 * POST /api/clubs/:clubId/discussions
 * Создать новое сообщение на доске обсуждений
 */
router.post('/clubs/:clubId/discussions', jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const { content } = req.body;
    
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!content?.trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }

    // Проверяем, является ли пользователь членом клуба
    const membership = await storage.getUserClubMembership(clubId, req.user.userId);
    if (!membership) {
      return res.status(403).json({ message: 'You must be a club member to post discussions' });
    }

    const discussion = await storage.createClubDiscussion({
      clubId,
      userId: req.user.userId,
      content: content.trim(),
    });

    res.status(201).json(discussion);
  } catch (error) {
    logger.error({ error }, 'Error creating club discussion');
    res.status(500).json({ message: 'Failed to create discussion' });
  }
});

/**
 * POST /api/clubs/:clubId/discussions/:discussionId/reply
 * Ответить на сообщение с цитированием
 */
router.post('/clubs/:clubId/discussions/:discussionId/reply', jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
  try {
    const { clubId, discussionId } = req.params;
    const { content, quotedContent } = req.body;
    
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!content?.trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }

    // Проверяем, является ли пользователь членом клуба
    const membership = await storage.getUserClubMembership(clubId, req.user.userId);
    if (!membership) {
      return res.status(403).json({ message: 'You must be a club member to reply to discussions' });
    }

    const reply = await storage.createClubDiscussion({
      clubId,
      userId: req.user.userId,
      content: content.trim(),
      parentId: discussionId,
      quotedContent: quotedContent?.trim(),
    });

    res.status(201).json(reply);
  } catch (error) {
    logger.error({ error }, 'Error creating discussion reply');
    res.status(500).json({ message: 'Failed to create reply' });
  }
});

/**
 * POST /api/clubs/:clubId/discussions/:discussionId/warn
 * Отправить предупреждение (только для владельца клуба)
 */
router.post('/clubs/:clubId/discussions/:discussionId/warn', jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
  try {
    const { clubId, discussionId } = req.params;
    const { content } = req.body;
    
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!content?.trim()) {
      return res.status(400).json({ message: 'Warning content is required' });
    }

    // Проверяем, является ли пользователь владельцем клуба
    const club = await storage.getClub(clubId);
    if (club?.ownerId !== req.user.userId) {
      return res.status(403).json({ message: 'Only club owner can send warnings' });
    }

    const warning = await storage.createClubDiscussion({
      clubId,
      userId: req.user.userId,
      content: content.trim(),
      parentId: discussionId,
      isWarning: true,
    });

    res.status(201).json(warning);
  } catch (error) {
    logger.error({ error }, 'Error creating discussion warning');
    res.status(500).json({ message: 'Failed to create warning' });
  }
});

/**
 * DELETE /api/clubs/:clubId/discussions/:discussionId
 * Удалить сообщение (только для владельца клуба)
 */
router.delete('/clubs/:clubId/discussions/:discussionId', jwtAuth, requireActiveUser, async (req: Request, res: Response) => {
  try {
    const { clubId, discussionId } = req.params;
    
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Проверяем, является ли пользователь владельцем клуба
    const club = await storage.getClub(clubId);
    if (club?.ownerId !== req.user.userId) {
      return res.status(403).json({ message: 'Only club owner can delete discussions' });
    }

    const success = await storage.deleteClubDiscussion(discussionId);
    if (!success) {
      return res.status(404).json({ message: 'Discussion not found' });
    }

    res.json({ message: 'Discussion deleted successfully' });
  } catch (error) {
    logger.error({ error }, 'Error deleting discussion');
    res.status(500).json({ message: 'Failed to delete discussion' });
  }
});

export default router;
