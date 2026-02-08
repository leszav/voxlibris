import { Router, Request, Response } from 'express';
import { storage } from '../repositories/index.js';
import { sessionAnalyticsService } from '../services/session-analytics-service.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * GET /api/sessions/:sessionId/analytics
 * Получить аналитику сессии
 */
router.get('/sessions/:sessionId/analytics', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Проверяем существование сессии
    const session = await storage.getReadingSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    const analytics = await sessionAnalyticsService.getSessionAnalytics(sessionId);

    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: 'Analytics not found for this session',
      });
    }

    // Парсим JSON поля
    const listenerRegions = JSON.parse(analytics.listenerRegions || '{}');
    const listenerCities = JSON.parse(analytics.listenerCities || '{}');
    const deviceTypes = JSON.parse(analytics.deviceTypes || '{}');
    const retention = JSON.parse(analytics.retention || '{}');

    res.json({
      success: true,
      analytics: {
        ...analytics,
        listenerRegions,
        listenerCities,
        deviceTypes,
        retention,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting session analytics: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get session analytics',
    });
  }
});

/**
 * GET /api/clubs/:clubId/analytics
 * Получить аналитику клуба
 */
router.get('/clubs/:clubId/analytics', async (req: Request, res: Response) => {
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

    const analytics = await sessionAnalyticsService.getClubAnalytics(clubId);

    res.json({
      success: true,
      analytics,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting club analytics: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get club analytics',
    });
  }
});

/**
 * GET /api/clubs/:clubId/analytics/sessions
 * Получить аналитику всех сессий клуба
 */
router.get('/clubs/:clubId/analytics/sessions', async (req: Request, res: Response) => {
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

    const sessions = await storage.readingSessions.getClubSessions(clubId);
    const analyticsList = [];

    for (const session of sessions) {
      const analytics = await sessionAnalyticsService.getSessionAnalytics(session.id);
      if (analytics) {
        analyticsList.push({
          sessionId: session.id,
          sessionTitle: session.title,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          analytics: {
            peakListenerCount: analytics.peakListenerCount,
            averageListenerCount: analytics.averageListenerCount,
            totalListeners: analytics.totalListeners,
            totalListenTime: analytics.totalListenTime,
            averageSessionDuration: analytics.averageSessionDuration,
            reactionCount: analytics.reactionCount,
            positiveReactionCount: analytics.positiveReactionCount,
            negativeReactionCount: analytics.negativeReactionCount,
            questionCount: analytics.questionCount,
            audioQualityScore: analytics.audioQualityScore,
            networkQualityScore: analytics.networkQualityScore,
          },
        });
      }
    }

    res.json({
      success: true,
      sessions: analyticsList,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting club sessions analytics: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get club sessions analytics',
    });
  }
});

/**
 * GET /api/users/:userId/analytics/reader
 * Получить аналитику чтеца
 */
router.get('/users/:userId/analytics/reader', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Проверяем существование пользователя
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Получаем сессии пользователя как чтеца
    const sessions = await storage.getSessionsByReader(userId);
    const analyticsList = [];

    for (const session of sessions) {
      const analytics = await sessionAnalyticsService.getSessionAnalytics(session.id);
      if (analytics) {
        analyticsList.push({
          sessionId: session.id,
          clubId: session.clubId,
          sessionTitle: session.title,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          analytics: {
            peakListenerCount: analytics.peakListenerCount ?? 0,
            averageListenerCount: analytics.averageListenerCount ?? 0,
            totalListeners: analytics.totalListeners ?? 0,
            totalListenTime: analytics.totalListenTime ?? 0,
            reactionCount: analytics.reactionCount ?? 0,
            questionCount: analytics.questionCount ?? 0,
            audioQualityScore: analytics.audioQualityScore ?? 0,
            networkQualityScore: analytics.networkQualityScore ?? 0,
          },
        });
      }
    }

    // Агрегируем статистику
    const totalSessions = analyticsList.length;
    const totalListeners = analyticsList.reduce((sum, a) => sum + (a.analytics.totalListeners ?? 0), 0);
    const averageListeners = totalSessions > 0 ? Math.round(totalListeners / totalSessions) : 0;
    const totalReactions = analyticsList.reduce((sum, a) => sum + (a.analytics.reactionCount ?? 0), 0);
    const totalQuestions = analyticsList.reduce((sum, a) => sum + (a.analytics.questionCount ?? 0), 0);
    const averageQuality =
      totalSessions > 0
        ? Math.round(
            analyticsList.reduce(
              (sum, a) =>
                sum +
                (a.analytics.audioQualityScore ?? 0) +
                (a.analytics.networkQualityScore ?? 0),
              0
            ) /
              (totalSessions * 2)
          )
        : 0;

    res.json({
      success: true,
      summary: {
        totalSessions,
        totalListeners,
        averageListeners,
        totalReactions,
        totalQuestions,
        averageQuality,
      },
      sessions: analyticsList,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting reader analytics: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get reader analytics',
    });
  }
});

/**
 * GET /api/sessions/:sessionId/analytics/export
 * Экспорт аналитики сессии в CSV
 */
router.get('/sessions/:sessionId/analytics/export', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const analytics = await sessionAnalyticsService.getSessionAnalytics(sessionId);
    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: 'Analytics not found',
      });
    }

    // Парсим JSON поля
    const listenerRegions = JSON.parse(analytics.listenerRegions || '{}');
    const listenerCities = JSON.parse(analytics.listenerCities || '{}');
    const deviceTypes = JSON.parse(analytics.deviceTypes || '{}');
    const retention = JSON.parse(analytics.retention || '{}');

    // Формируем CSV
    const csv = [
      'Metric,Value',
      `Session ID,${analytics.sessionId}`,
      `Peak Listeners,${analytics.peakListenerCount}`,
      `Average Listeners,${analytics.averageListenerCount}`,
      `Total Listeners,${analytics.totalListeners}`,
      `Total Listen Time (seconds),${analytics.totalListenTime}`,
      `Average Session Duration (seconds),${analytics.averageSessionDuration}`,
      `Total Reactions,${analytics.reactionCount}`,
      `Positive Reactions,${analytics.positiveReactionCount}`,
      `Negative Reactions,${analytics.negativeReactionCount}`,
      `Total Questions,${analytics.questionCount}`,
      `Audio Quality Score,${analytics.audioQualityScore}`,
      `Network Quality Score,${analytics.networkQualityScore}`,
      '',
      'Listener Regions',
      Object.entries(listenerRegions).map(([region, count]) => `${region},${count}`).join('\n'),
      '',
      'Listener Cities',
      Object.entries(listenerCities).map(([city, count]) => `${city},${count}`).join('\n'),
      '',
      'Device Types',
      Object.entries(deviceTypes).map(([type, count]) => `${type},${count}`).join('\n'),
      '',
      'Retention',
      Object.entries(retention).map(([duration, count]) => `${duration},${count}`).join('\n'),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=session-${sessionId}-analytics.csv`);
    res.send(csv);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error exporting session analytics: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to export session analytics',
    });
  }
});

export default router;
