import { Router, Request, Response } from 'express';
import { jwtAuth, requireActiveUser } from './jwt-middleware.js';
import { storage } from './repositories/index.js';
import { logger } from './lib/logger.js';
import { db } from './db.js';
import { and, eq } from 'drizzle-orm';
import { clubDiscussions, clubs, notifications } from '../shared/schema.js';
import { notificationService } from './services/notification-service.js';
import { canClubMemberWrite } from './lib/club-member-moderation.js';

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

    if (!canClubMemberWrite(membership)) {
      return res.status(403).json({ message: 'Ваши права на публикацию в клубе временно ограничены', code: 'CLUB_MEMBER_RESTRICTED' });
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

    if (!canClubMemberWrite(membership)) {
      return res.status(403).json({ message: 'Ваши права на публикацию в клубе временно ограничены', code: 'CLUB_MEMBER_RESTRICTED' });
    }

    const parentRows = await db
      .select({
        id: clubDiscussions.id,
        parentAuthorId: clubDiscussions.userId,
        clubName: clubs.title,
      })
      .from(clubDiscussions)
      .innerJoin(clubs, eq(clubs.id, clubDiscussions.clubId))
      .where(and(eq(clubDiscussions.id, discussionId), eq(clubDiscussions.clubId, clubId)))
      .limit(1);

    const parent = parentRows[0];
    if (!parent) {
      return res.status(404).json({ message: 'Discussion not found' });
    }

    const reply = await storage.createClubDiscussion({
      clubId,
      userId: req.user.userId,
      content: content.trim(),
      parentId: discussionId,
      quotedContent: quotedContent?.trim(),
    });

    if (parent.parentAuthorId !== req.user.userId) {
      try {
        const targetSettings = await notificationService.getUserNotificationSettings(parent.parentAuthorId);
        if (targetSettings.notifyReply) {
          await db.insert(notifications).values({
            userId: parent.parentAuthorId,
            type: 'reply',
            kind: 'club_discussion_reply',
            sourceUserId: req.user.userId,
            actorUserId: req.user.userId,
            entityType: 'club_discussion_comment',
            entityId: discussionId,
            actionUrl: `/clubs/${encodeURIComponent(clubId)}?tab=discussion&discussion=${encodeURIComponent(discussionId)}`,
            payload: { clubId, clubName: parent.clubName },
            message: parent.clubName ? `«${parent.clubName}»` : 'в обсуждениях клуба',
          });
        }
      } catch (notificationError) {
        logger.warn({ error: notificationError, clubId, discussionId }, 'Failed to create discussion reply notification');
      }
    }

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
    if (!club) {
      return res.status(404).json({ message: 'Клуб не найден' });
    }
    
    if (club.ownerId !== req.user.userId) {
      return res.status(403).json({ message: 'Только владелец клуба может отправлять предупреждения' });
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
    
    if (!club) {
      return res.status(404).json({ message: 'Клуб не найден' });
    }
    
    if (club.ownerId !== req.user.userId) {
      return res.status(403).json({ message: 'Только владелец клуба может удалять сообщения' });
    }

    const success = await storage.deleteClubDiscussion(discussionId);
    if (!success) {
      return res.status(404).json({ message: 'Сообщение не найдено' });
    }

    res.json({ message: 'Сообщение удалено' });
  } catch (error) {
    logger.error({ error }, 'Error deleting discussion');
    res.status(500).json({ message: 'Failed to delete discussion' });
  }
});

export default router;
