import { Router, Request, Response } from 'express';
import { activityService } from '../services/activity-service.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * GET /api/feed
 * Лента текущего пользователя (cursor pagination).
 * Query: ?limit=20&cursor=<timestamp_ms>
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const result = await activityService.getFeed(userId, limit, cursor);

    res.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[GET /api/feed] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to load feed' });
  }
});

/**
 * GET /api/feed/unseen-count
 * Число непрочитанных событий ленты (для red dot в навигации).
 */
router.get('/unseen-count', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const count = await activityService.getUnseenCount(userId);
    res.json({ success: true, count });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[GET /api/feed/unseen-count] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to get unseen count' });
  }
});

/**
 * POST /api/feed/mark-seen
 * Пометить ленту просмотренной (счётчик → 0).
 */
router.post('/mark-seen', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    await activityService.markFeedSeen(userId);
    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[POST /api/feed/mark-seen] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to mark feed seen' });
  }
});

/**
 * GET /api/feed/activity/:userId
 * Публичная активность конкретного пользователя (для страницы профиля).
 * jwtAuth опционален — регистрируем через optionalJwtAuth на уровне server/index.ts
 */
router.get('/activity/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user?.id ?? null;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const result = await activityService.getUserActivity(userId, viewerId, limit, cursor);

    res.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[GET /api/feed/activity/:userId] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to load user activity' });
  }
});

export default router;
