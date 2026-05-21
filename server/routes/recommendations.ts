import { Router, type Request, type Response } from 'express';
import { recommendationService } from '../services/recommendation-service.js';
import { logger } from '../lib/logger.js';

const router = Router();

function isRecommendationEntityType(value: unknown): value is 'book' | 'club' | 'reader' | 'live' {
  return value === 'book' || value === 'club' || value === 'reader' || value === 'live';
}

function isBooksSourcePreference(value: unknown): value is 'all' | 'activity' | 'community' {
  return value === 'all' || value === 'activity' || value === 'community';
}

router.get('/overview', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const data = await recommendationService.getOverview(userId);
    res.json({ success: true, ...data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[GET /api/recommendations/overview] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to load recommendations overview' });
  }
});

router.get('/books', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const items = await recommendationService.getBooksForUser(userId, 12);
    res.json({ success: true, items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[GET /api/recommendations/books] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to load recommended books' });
  }
});

router.get('/clubs', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const items = await recommendationService.getClubsForUser(userId, 12);
    res.json({ success: true, items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[GET /api/recommendations/clubs] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to load recommended clubs' });
  }
});

router.get('/readers', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const items = await recommendationService.getReadersForUser(userId, 12);
    res.json({ success: true, items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[GET /api/recommendations/readers] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to load recommended readers' });
  }
});

router.get('/live', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const items = await recommendationService.getLiveForUser(userId, 12);
    res.json({ success: true, items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[GET /api/recommendations/live] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to load live recommendations' });
  }
});

router.get('/preferences', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const preferences = await recommendationService.getPreferences(userId);
    res.json({ success: true, preferences });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[GET /api/recommendations/preferences] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to load recommendation preferences' });
  }
});

router.put('/preferences', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const body = req.body as {
    excludedTypes?: unknown;
    booksSourcePreference?: unknown;
  };

  if (body.excludedTypes !== undefined && !Array.isArray(body.excludedTypes)) {
    return res.status(400).json({ success: false, error: 'excludedTypes must be an array' });
  }

  if (
    body.excludedTypes !== undefined
    && (body.excludedTypes as unknown[]).some((type) => !isRecommendationEntityType(type))
  ) {
    return res.status(400).json({ success: false, error: 'excludedTypes contains unsupported value' });
  }

  if (
    body.booksSourcePreference !== undefined
    && !isBooksSourcePreference(body.booksSourcePreference)
  ) {
    return res.status(400).json({ success: false, error: 'Invalid booksSourcePreference' });
  }

  try {
    const preferences = await recommendationService.updatePreferences(userId, {
      excludedTypes: body.excludedTypes as ('book' | 'club' | 'reader' | 'live')[] | undefined,
      booksSourcePreference: body.booksSourcePreference as 'all' | 'activity' | 'community' | undefined,
    });

    res.json({ success: true, preferences });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[PUT /api/recommendations/preferences] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to update recommendation preferences' });
  }
});

router.post('/dismiss', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const body = req.body as {
    entityType?: unknown;
    entityId?: unknown;
    source?: unknown;
    reason?: unknown;
  };

  if (!isRecommendationEntityType(body.entityType)) {
    return res.status(400).json({ success: false, error: 'Invalid entityType' });
  }

  if (typeof body.entityId !== 'string' || body.entityId.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'entityId is required' });
  }

  if (
    body.source !== undefined
    && body.source !== null
    && body.source !== 'activity'
    && body.source !== 'community'
    && body.source !== 'mixed'
  ) {
    return res.status(400).json({ success: false, error: 'Invalid source' });
  }

  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid reason' });
  }

  try {
    await recommendationService.dismiss(userId, {
      entityType: body.entityType,
      entityId: body.entityId.trim(),
      source: (body.source as 'activity' | 'community' | 'mixed' | null | undefined) ?? null,
      reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 120) : null,
    });

    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[POST /api/recommendations/dismiss] ${msg}`);
    res.status(500).json({ success: false, error: 'Failed to dismiss recommendation' });
  }
});

export default router;
