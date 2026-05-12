import { Router, type Request, type Response } from 'express';
import { logger } from '../lib/logger.js';
import { gamificationService } from '../services/gamification-service.js';

const router = Router();

router.get('/me/achievements', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [achievements, streak] = await Promise.all([
      gamificationService.listAwardedAchievements(userId),
      gamificationService.getUserStreak(userId),
    ]);

    return res.json({ success: true, achievements, streak });
  } catch (err) {
    logger.error({ err, userId }, '[gamification] get self achievements error');
    return res.status(500).json({ error: 'Failed to load achievements' });
  }
});

router.get('/users/:userId/achievements', async (req: Request, res: Response) => {
  const viewerId = req.user?.id;
  if (!viewerId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId } = req.params;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const [achievements, streak] = await Promise.all([
      gamificationService.listAwardedAchievements(userId),
      gamificationService.getUserStreak(userId),
    ]);

    return res.json({ success: true, achievements, streak });
  } catch (err) {
    logger.error({ err, userId, viewerId }, '[gamification] get user achievements error');
    return res.status(500).json({ error: 'Failed to load achievements' });
  }
});

export default router;
