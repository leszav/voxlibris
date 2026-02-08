import { Router, Request, Response } from 'express';
import { notificationService } from '../services/notification-service.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * GET /api/notifications/settings
 * Получить настройки уведомлений текущего пользователя
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const settings = await notificationService.getUserNotificationSettings(userId);

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting notification settings: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get notification settings',
    });
  }
});

/**
 * PUT /api/notifications/settings
 * Обновить настройки уведомлений текущего пользователя
 */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const {
      emailEnabled,
      pushEnabled,
      reminderMinutes,
      sessionStart,
      sessionEnd,
      newQuestion,
    } = req.body;

    const success = await notificationService.updateUserNotificationSettings(userId, {
      emailEnabled,
      pushEnabled,
      reminderMinutes,
      sessionStart,
      sessionEnd,
      newQuestion,
    });

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update notification settings',
      });
    }

    // Возвращаем обновленные настройки
    const settings = await notificationService.getUserNotificationSettings(userId);

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating notification settings: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification settings',
    });
  }
});

export default router;
