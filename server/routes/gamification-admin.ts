import { Router, type Request, type Response } from 'express';
import { repositories } from '../repositories/index.js';
import { requireAdmin } from '../jwt-middleware.js';
import { logger } from '../lib/logger.js';
import { gamificationService } from '../services/gamification-service.js';
import { storeOptimizedImageIfNeeded } from '../lib/uploaded-image-storage.js';

const router = Router();

router.use(requireAdmin);

async function normalizeRewardAssetPayload<T extends Record<string, unknown>>(payload: T): Promise<T> {
  const imageUrl = typeof payload.imageUrl === 'string' ? payload.imageUrl : undefined;
  if (imageUrl === undefined) {
    return payload;
  }

  const normalizedImageUrl = await storeOptimizedImageIfNeeded(imageUrl, {
    type: 'reward-asset',
    keyPrefix: 'gamification/reward-assets',
    filenamePrefix: 'reward-asset',
  });

  return {
    ...payload,
    imageUrl: normalizedImageUrl,
  };
}

router.get('/building-blocks', async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive !== 'false';
    const blocks = await repositories.gamification.listBuildingBlocks(includeInactive);
    return res.json({ success: true, blocks });
  } catch (err) {
    logger.error({ err }, '[gamification-admin] list blocks error');
    return res.status(500).json({ error: 'Failed to load building blocks' });
  }
});

router.post('/building-blocks', async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const block = await repositories.gamification.createBuildingBlock(adminId, req.body ?? {});
    return res.status(201).json({ success: true, block });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: message.replace('VALIDATION_ERROR: ', '') });
    }
    logger.error({ err }, '[gamification-admin] create block error');
    return res.status(500).json({ error: 'Failed to create building block' });
  }
});

router.patch('/building-blocks/:id', async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const block = await repositories.gamification.updateBuildingBlock(adminId, req.params.id, req.body ?? {});
    if (!block) {
      return res.status(404).json({ error: 'Building block not found' });
    }
    return res.json({ success: true, block });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: message.replace('VALIDATION_ERROR: ', '') });
    }
    logger.error({ err }, '[gamification-admin] update block error');
    return res.status(500).json({ error: 'Failed to update building block' });
  }
});

router.delete('/building-blocks/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await repositories.gamification.deleteBuildingBlock(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Building block not found' });
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, '[gamification-admin] delete block error');
    return res.status(500).json({ error: 'Failed to delete building block' });
  }
});

router.get('/achievements', async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const achievements = await repositories.gamification.listAchievements(
      status as 'draft' | 'active' | 'archived' | undefined,
    );
    return res.json({ success: true, achievements });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: message.replace('VALIDATION_ERROR: ', '') });
    }
    logger.error({ err }, '[gamification-admin] list achievements error');
    return res.status(500).json({ error: 'Failed to load achievements' });
  }
});

router.get('/reward-assets', async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive !== 'false';
    const assets = await repositories.gamification.listRewardAssets(includeInactive);
    return res.json({ success: true, assets });
  } catch (err) {
    logger.error({ err }, '[gamification-admin] list reward assets error');
    return res.status(500).json({ error: 'Failed to load reward assets' });
  }
});

router.post('/reward-assets', async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = await normalizeRewardAssetPayload({ ...(req.body ?? {}) });
    const asset = await repositories.gamification.createRewardAsset(adminId, payload);
    return res.status(201).json({ success: true, asset });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: message.replace('VALIDATION_ERROR: ', '') });
    }
    logger.error({ err }, '[gamification-admin] create reward asset error');
    return res.status(500).json({ error: 'Failed to create reward asset' });
  }
});

router.patch('/reward-assets/:id', async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = await normalizeRewardAssetPayload({ ...(req.body ?? {}) });
    const asset = await repositories.gamification.updateRewardAsset(adminId, req.params.id, payload);
    if (!asset) {
      return res.status(404).json({ error: 'Reward asset not found' });
    }
    return res.json({ success: true, asset });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: message.replace('VALIDATION_ERROR: ', '') });
    }
    logger.error({ err }, '[gamification-admin] update reward asset error');
    return res.status(500).json({ error: 'Failed to update reward asset' });
  }
});

router.delete('/reward-assets/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await repositories.gamification.deleteRewardAsset(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Reward asset not found' });
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, '[gamification-admin] delete reward asset error');
    return res.status(500).json({ error: 'Failed to delete reward asset' });
  }
});

router.post('/reward-assets/bulk-delete', async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    const deletedCount = await repositories.gamification.bulkDeleteRewardAssets(ids);
    return res.json({ success: true, deletedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: message.replace('VALIDATION_ERROR: ', '') });
    }
    logger.error({ err }, '[gamification-admin] bulk delete reward assets error');
    return res.status(500).json({ error: 'Failed to bulk delete reward assets' });
  }
});

router.post('/reward-assets/bulk-import', async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = await Promise.all(
      rawItems.map(async (item: unknown) => {
        if (!item || typeof item !== 'object') {
          return item;
        }

        return normalizeRewardAssetPayload({ ...(item as Record<string, unknown>) });
      }),
    );
    const assets = await repositories.gamification.bulkImportRewardAssets(adminId, items);
    return res.status(201).json({ success: true, assets, createdCount: assets.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: message.replace('VALIDATION_ERROR: ', '') });
    }
    logger.error({ err }, '[gamification-admin] bulk import reward assets error');
    return res.status(500).json({ error: 'Failed to bulk import reward assets' });
  }
});

router.get('/achievements/:id', async (req: Request, res: Response) => {
  try {
    const achievement = await repositories.gamification.getAchievement(req.params.id);
    if (!achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }
    return res.json({ success: true, achievement });
  } catch (err) {
    logger.error({ err }, '[gamification-admin] get achievement error');
    return res.status(500).json({ error: 'Failed to load achievement' });
  }
});

async function normalizeAchievementPayload<T extends Record<string, unknown>>(payload: T): Promise<T> {
  const badgeImageUrl = typeof payload.badgeImageUrl === 'string' ? payload.badgeImageUrl : undefined;
  if (badgeImageUrl === undefined) {
    return payload;
  }

  const normalizedBadgeImageUrl = await storeOptimizedImageIfNeeded(badgeImageUrl, {
    type: 'reward-asset',
    keyPrefix: 'gamification/achievements',
    filenamePrefix: 'badge',
  });

  return {
    ...payload,
    badgeImageUrl: normalizedBadgeImageUrl,
  };
}

router.post('/achievements', async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = await normalizeAchievementPayload({ ...(req.body ?? {}) });
    const achievement = await repositories.gamification.createAchievement(adminId, payload);
    return res.status(201).json({ success: true, achievement });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: message.replace('VALIDATION_ERROR: ', '') });
    }
    logger.error({ err }, '[gamification-admin] create achievement error');
    return res.status(500).json({ error: 'Failed to create achievement' });
  }
});

router.patch('/achievements/:id', async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = await normalizeAchievementPayload({ ...(req.body ?? {}) });
    const achievement = await repositories.gamification.updateAchievement(adminId, req.params.id, payload);
    if (!achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }
    return res.json({ success: true, achievement });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: message.replace('VALIDATION_ERROR: ', '') });
    }
    logger.error({ err }, '[gamification-admin] update achievement error');
    return res.status(500).json({ error: 'Failed to update achievement' });
  }
});

router.delete('/achievements/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await repositories.gamification.deleteAchievement(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Achievement not found' });
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, '[gamification-admin] delete achievement error');
    return res.status(500).json({ error: 'Failed to delete achievement' });
  }
});

router.post('/recalculate/users/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const result = await gamificationService.syncUserStateAndAward(userId, 'admin_manual_recalculate');
    return res.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('VALIDATION_ERROR:')) {
      return res.status(400).json({ error: message.replace('VALIDATION_ERROR: ', '') });
    }
    if (message.startsWith('NOT_FOUND:')) {
      return res.status(404).json({ error: message.replace('NOT_FOUND: ', '') });
    }
    logger.error({ err, userId }, '[gamification-admin] recalculate user error');
    return res.status(500).json({ error: 'Failed to recalculate user state' });
  }
});

router.post('/reconcile/run', async (req: Request, res: Response) => {
  const rawBatchSize = req.body?.batchSize;
  const rawMaxUsers = req.body?.maxUsers;

  const batchSize = Number.isFinite(Number(rawBatchSize)) ? Number(rawBatchSize) : undefined;
  const maxUsers = Number.isFinite(Number(rawMaxUsers)) ? Number(rawMaxUsers) : undefined;

  if (batchSize !== undefined && batchSize <= 0) {
    return res.status(400).json({ error: 'batchSize must be > 0' });
  }

  if (maxUsers !== undefined && maxUsers <= 0) {
    return res.status(400).json({ error: 'maxUsers must be > 0' });
  }

  try {
    const summary = await gamificationService.reconcileUsers({
      batchSize,
      maxUsers,
      reason: 'admin_manual_reconcile',
    });

    return res.json({ success: true, summary });
  } catch (err) {
    logger.error({ err, batchSize, maxUsers }, '[gamification-admin] reconcile run error');
    return res.status(500).json({ error: 'Failed to run gamification reconcile' });
  }
});

export default router;
