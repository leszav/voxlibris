import { Router, type Request, type Response } from 'express';
import { repositories } from '../repositories/index.js';
import { logger } from '../lib/logger.js';
import { activityService } from '../services/activity-service.js';
import { gamificationService } from '../services/gamification-service.js';
import { getRedisClient } from '../lib/redis.js';

const router = Router();

const FOLLOW_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const FOLLOW_RATE_LIMIT_MAX = 100;

type FollowRateLimitFallbackEntry = {
  count: number;
  resetAt: number;
};

const followRateLimitFallback = new Map<string, FollowRateLimitFallbackEntry>();

function consumeFollowRateLimitFallback(userId: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = followRateLimitFallback.get(userId);

  if (!existing || existing.resetAt <= now) {
    followRateLimitFallback.set(userId, {
      count: 1,
      resetAt: now + FOLLOW_RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  followRateLimitFallback.set(userId, existing);

  if (existing.count > FOLLOW_RATE_LIMIT_MAX) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

async function consumeFollowRateLimit(userId: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const redis = await getRedisClient();
  if (!redis) {
    return consumeFollowRateLimitFallback(userId);
  }

  const slot = Math.floor(Date.now() / FOLLOW_RATE_LIMIT_WINDOW_MS);
  const key = `rl:social:follow:${userId}:${slot}`;

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.pExpire(key, FOLLOW_RATE_LIMIT_WINDOW_MS + 1000);
    }

    if (current > FOLLOW_RATE_LIMIT_MAX) {
      const ttlMs = await redis.pTTL(key);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : FOLLOW_RATE_LIMIT_WINDOW_MS) / 1000)),
      };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  } catch (error) {
    logger.warn({ error }, '[social] follow rate-limit redis failed, using memory fallback');
    return consumeFollowRateLimitFallback(userId);
  }
}

// ── Follow / Unfollow ──────────────────────────────────────────────────────

/**
 * POST /api/social/follow/:userId
 * Подписаться на пользователя
 */
router.post('/follow/:userId', async (req: Request, res: Response) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const rateLimit = await consumeFollowRateLimit(currentUserId);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Too many follow actions. Please try again later.',
      retryAfter: `${rateLimit.retryAfterSeconds} seconds`,
      code: 'FOLLOW_RATE_LIMIT',
    });
  }

  const { userId: targetId } = req.params;
  if (currentUserId === targetId) {
    return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
  }

  try {
    // Проверяем блокировку
    const blocked = await repositories.social.isBlockedEither(currentUserId, targetId);
    if (blocked) {
      return res.status(403).json({ success: false, error: 'Action not allowed' });
    }

    await repositories.social.follow(currentUserId, targetId);

    // Событие ленты: подписка на пользователя
    activityService.emit({
      actorId: currentUserId,
      eventType: 'followed_user',
      targetType: 'user',
      targetId,
      metadata: { targetUserId: targetId },
    }).catch((err) => logger.warn('[activity] followed_user emit failed', err));

    Promise.all([
      gamificationService.recordUserActivityAndAward(currentUserId, 'follow_created'),
      gamificationService.syncUserStateAndAward(targetId, 'follow_received'),
    ]).catch((err) => logger.warn('[gamification] follow sync failed', err));

    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] follow error');
    res.status(500).json({ success: false, error: 'Failed to follow user' });
  }
});

/**
 * DELETE /api/social/follow/:userId
 * Отписаться
 */
router.delete('/follow/:userId', async (req: Request, res: Response) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    await repositories.social.unfollow(currentUserId, req.params.userId);

    Promise.all([
      gamificationService.syncUserStateAndAward(currentUserId, 'follow_removed'),
      gamificationService.syncUserStateAndAward(req.params.userId, 'follow_lost'),
    ]).catch((err) => logger.warn('[gamification] unfollow sync failed', err));

    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] unfollow error');
    res.status(500).json({ success: false, error: 'Failed to unfollow user' });
  }
});

/**
 * GET /api/social/follow-status/:userId
 * Проверить взаимный статус подписок
 */
router.get('/follow-status/:userId', async (req: Request, res: Response) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const status = await repositories.social.getFollowStatus(currentUserId, req.params.userId);
    res.json({ success: true, ...status });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] follow-status error');
    res.status(500).json({ success: false, error: 'Failed to get follow status' });
  }
});

/**
 * GET /api/social/followers/:userId
 * Список подписчиков пользователя (с пагинацией)
 */
router.get('/followers/:userId', async (req: Request, res: Response) => {
  const viewerId = req.user?.id ?? null;
  const { userId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

  try {
    const canView = await repositories.social.canViewProfile(viewerId, userId);
    if (!canView) {
      return res.status(403).json({ success: false, error: 'Profile is private' });
    }

    const result = await repositories.social.getFollowers(userId, limit, cursor);
    res.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] followers error');
    res.status(500).json({ success: false, error: 'Failed to get followers' });
  }
});

/**
 * GET /api/social/following/:userId
 * Список подписок пользователя
 */
router.get('/following/:userId', async (req: Request, res: Response) => {
  const viewerId = req.user?.id ?? null;
  const { userId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

  try {
    const canView = await repositories.social.canViewProfile(viewerId, userId);
    if (!canView) {
      return res.status(403).json({ success: false, error: 'Profile is private' });
    }

    const result = await repositories.social.getFollowing(userId, limit, cursor);
    res.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] following error');
    res.status(500).json({ success: false, error: 'Failed to get following' });
  }
});

// ── Block / Unblock ────────────────────────────────────────────────────────

/**
 * POST /api/social/block/:userId
 * Заблокировать пользователя
 */
router.post('/block/:userId', async (req: Request, res: Response) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { userId: targetId } = req.params;
  if (currentUserId === targetId) {
    return res.status(400).json({ success: false, error: 'Cannot block yourself' });
  }

  try {
    await repositories.social.block(currentUserId, targetId);
    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] block error');
    res.status(500).json({ success: false, error: 'Failed to block user' });
  }
});

/**
 * DELETE /api/social/block/:userId
 * Разблокировать пользователя
 */
router.delete('/block/:userId', async (req: Request, res: Response) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    await repositories.social.unblock(currentUserId, req.params.userId);
    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] unblock error');
    res.status(500).json({ success: false, error: 'Failed to unblock user' });
  }
});

/**
 * GET /api/social/blocks
 * Мой список блокировок
 */
router.get('/blocks', async (req: Request, res: Response) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const blocks = await repositories.social.getBlockList(currentUserId);
    res.json({ success: true, blocks });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] blocks error');
    res.status(500).json({ success: false, error: 'Failed to get block list' });
  }
});

// ── Mute / Unmute ──────────────────────────────────────────────────────────

/**
 * POST /api/social/mute/:userId
 */
router.post('/mute/:userId', async (req: Request, res: Response) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { userId: targetId } = req.params;
  if (currentUserId === targetId) {
    return res.status(400).json({ success: false, error: 'Cannot mute yourself' });
  }

  try {
    await repositories.social.mute(currentUserId, targetId);
    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] mute error');
    res.status(500).json({ success: false, error: 'Failed to mute user' });
  }
});

/**
 * DELETE /api/social/mute/:userId
 */
router.delete('/mute/:userId', async (req: Request, res: Response) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    await repositories.social.unmute(currentUserId, req.params.userId);
    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] unmute error');
    res.status(500).json({ success: false, error: 'Failed to unmute user' });
  }
});

// ── Privacy Settings ───────────────────────────────────────────────────────

/**
 * GET /api/social/privacy
 * Мои настройки приватности
 */
router.get('/privacy', async (req: Request, res: Response) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const settings = await repositories.social.getPrivacySettings(currentUserId);
    res.json({ success: true, settings });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] privacy get error');
    res.status(500).json({ success: false, error: 'Failed to get privacy settings' });
  }
});

/**
 * PATCH /api/social/privacy
 * Обновить настройки приватности
 */
router.patch('/privacy', async (req: Request, res: Response) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const allowed = ['profileVisibility', 'readingStatsVisible', 'clubsVisible', 'readingHistoryVisible', 'allowDmFrom'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: 'No valid fields to update' });
  }

  try {
    const settings = await repositories.social.updatePrivacySettings(currentUserId, updates);
    res.json({ success: true, settings });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error: msg }, '[social] privacy update error');
    res.status(500).json({ success: false, error: 'Failed to update privacy settings' });
  }
});

export default router;
