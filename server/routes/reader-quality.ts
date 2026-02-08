import { Router, Request, Response } from 'express';
import { storage } from '../repositories/index.js';
import { readerQualityService } from '../services/reader-quality-service.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * POST /api/reader-quality/ratings
 * Создать оценку чтеца
 */
router.post('/ratings', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const {
      ratedUserId,
      clubId,
      sessionId,
      voiceQuality,
      readingPace,
      articulation,
      emotion,
      overallRating,
      feedback,
    } = req.body;

    if (!ratedUserId || !clubId || !sessionId || overallRating === undefined) {
      return res.status(400).json({
        success: false,
        error: 'ratedUserId, clubId, sessionId, and overallRating are required',
      });
    }

    const result = await readerQualityService.createRating({
      ratedUserId,
      raterUserId: userId,
      clubId,
      sessionId,
      voiceQuality,
      readingPace,
      articulation,
      emotion,
      overallRating,
      feedback,
    });

    res.status(201).json({
      success: true,
      ratingId: result.ratingId,
      averageRating: result.averageRating,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error creating rating: ${errorMessage}`);
    res.status(400).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * GET /api/reader-quality/ratings/:ratingId
 * Получить оценку по ID
 */
router.get('/ratings/:ratingId', async (req: Request, res: Response) => {
  try {
    const { ratingId } = req.params;

    const rating = await readerQualityService.getRating(ratingId);

    if (!rating) {
      return res.status(404).json({
        success: false,
        error: 'Rating not found',
      });
    }

    res.json({
      success: true,
      rating,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting rating: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get rating',
    });
  }
});

/**
 * PUT /api/reader-quality/ratings/:ratingId
 * Обновить оценку
 */
router.put('/ratings/:ratingId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { ratingId } = req.params;
    const {
      voiceQuality,
      readingPace,
      articulation,
      emotion,
      overallRating,
      feedback,
    } = req.body;

    const result = await readerQualityService.updateRating(ratingId, userId, {
      voiceQuality,
      readingPace,
      articulation,
      emotion,
      overallRating,
      feedback,
    });

    res.json({
      success: true,
      ratingId: result.ratingId,
      averageRating: result.averageRating,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating rating: ${errorMessage}`);
    res.status(400).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * DELETE /api/reader-quality/ratings/:ratingId
 * Удалить оценку
 */
router.delete('/ratings/:ratingId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { ratingId } = req.params;

    const success = await readerQualityService.deleteRating(ratingId, userId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Rating not found',
      });
    }

    res.json({
      success: true,
      message: 'Rating deleted successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error deleting rating: ${errorMessage}`);
    res.status(400).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * GET /api/reader-quality/readers/:userId/ratings
 * Получить оценки чтеца
 */
router.get('/readers/:userId/ratings', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = req.query.limit ? Number.parseInt(req.query.limit as string, 10) : undefined;

    const ratings = await readerQualityService.getReaderRatings(userId, limit);

    res.json({
      success: true,
      ratings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting reader ratings: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get reader ratings',
    });
  }
});

/**
 * GET /api/reader-quality/readers/:userId/ratings/club/:clubId
 * Получить оценки чтеца по клубу
 */
router.get('/readers/:userId/ratings/club/:clubId', async (req: Request, res: Response) => {
  try {
    const { userId, clubId } = req.params;

    const ratings = await readerQualityService.getReaderRatingsInClub(userId, clubId);

    res.json({
      success: true,
      ratings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting reader ratings in club: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get reader ratings in club',
    });
  }
});

/**
 * GET /api/reader-quality/readers/:userId/stats
 * Получить статистику качества чтеца
 */
router.get('/readers/:userId/stats', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const stats = await readerQualityService.getReaderQualityStats(userId);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting reader quality stats: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get reader quality stats',
    });
  }
});

/**
 * GET /api/reader-quality/clubs/:clubId/ratings
 * Получить оценки по клубу
 */
router.get('/clubs/:clubId/ratings', async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;

    // Проверяем существование клуба
    const club = await storage.getClub(clubId);
    if (!club) {
      return res.status(404).json({
        success: false,
        error: 'Club not found',
      });
    }

    const ratings = await readerQualityService.getClubRatings(clubId);

    res.json({
      success: true,
      ratings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting club ratings: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get club ratings',
    });
  }
});

/**
 * GET /api/reader-quality/readers/top
 * Получить топ чтецов по рейтингу
 */
router.get('/readers/top', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? Number.parseInt(req.query.limit as string, 10) : 10;
    const minRatings = req.query.minRatings ? Number.parseInt(req.query.minRatings as string, 10) : 5;

    const topReaders = await readerQualityService.getTopReadersByRating(limit, minRatings);

    res.json({
      success: true,
      topReaders,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting top readers: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get top readers',
    });
  }
});

/**
 * POST /api/reader-quality/check-can-rate
 * Проверить, может ли пользователь оценить чтеца
 */
router.post('/check-can-rate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { ratedUserId, clubId, sessionId } = req.body;

    if (!ratedUserId || !clubId || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'ratedUserId, clubId, and sessionId are required',
      });
    }

    const result = await readerQualityService.canRateReader(userId, ratedUserId, clubId, sessionId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error checking if user can rate reader: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to check if user can rate reader',
    });
  }
});

export default router;
