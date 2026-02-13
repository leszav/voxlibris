import { Router, Request, Response } from 'express';
import { repositories, storage } from '../repositories/index.js';
import { logger } from '../lib/logger.js';
import { notificationService } from '../services/notification-service.js';
import type { ReadingSchedule, ScheduleStatus } from '../../shared/schema.js';

const router = Router();

async function getScheduleOrRespond(
  res: Response,
  scheduleId: string
): Promise<ReadingSchedule | null> {
  const schedule = await repositories.readingSchedule.getSchedule(scheduleId);
  if (!schedule) {
    res.status(404).json({
      success: false,
      error: 'Schedule not found',
    });
    return null;
  }
  return schedule;
}

function ensureScheduleCreator(
  res: Response,
  schedule: ReadingSchedule,
  userId: string,
  errorMessage: string
): boolean {
  if (schedule.createdBy !== userId) {
    res.status(403).json({
      success: false,
      error: errorMessage,
    });
    return false;
  }
  return true;
}

function ensureScheduleStatus(
  res: Response,
  schedule: ReadingSchedule,
  requiredStatus: string,
  errorMessage: string
): boolean {
  if (schedule.status !== requiredStatus) {
    res.status(400).json({
      success: false,
      error: errorMessage,
    });
    return false;
  }
  return true;
}

async function notifySessionStart(schedule: ReadingSchedule, initiatorId: string): Promise<void> {
  try {
    const memberships = await repositories.clubs.getClubMembers(schedule.clubId);
    if (!memberships || memberships.length === 0) {
      return;
    }

    for (const member of memberships) {
      if (!member.email || member.id === initiatorId) {
        continue;
      }

      await notificationService.sendSessionStartNotification(
        schedule,
        member.id,
        member.email
      );
    }
  } catch (notifyError) {
    const errorMessage = notifyError instanceof Error ? notifyError.message : String(notifyError);
    logger.warn({ error: errorMessage }, 'Failed to send session start notifications');
  }
}

async function notifySessionEnd(schedule: ReadingSchedule, initiatorId: string): Promise<void> {
  try {
    const memberships = await repositories.clubs.getClubMembers(schedule.clubId);
    if (!memberships || memberships.length === 0) {
      return;
    }

    for (const member of memberships) {
      if (!member.email || member.id === initiatorId) {
        continue;
      }

      await notificationService.sendSessionEndNotification(
        schedule,
        member.id,
        member.email
      );
    }
  } catch (notifyError) {
    const errorMessage = notifyError instanceof Error ? notifyError.message : String(notifyError);
    logger.warn({ error: errorMessage }, 'Failed to send session end notifications');
  }
}

const scheduleStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
function isScheduleStatus(value: string): value is ScheduleStatus {
  return scheduleStatuses.includes(value as ScheduleStatus);
}

/**
 * POST /api/schedule
 * Создать расписание
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const {
      clubId,
      bookId,
      title,
      description,
      scheduledStart,
      scheduledEnd,
      estimatedDuration,
      startChapter,
      startPosition,
      endChapter,
      endPosition,
      isRecurring,
      recurringPattern,
      reminderMinutes,
    } = req.body;

    if (!clubId || !bookId || !title || !scheduledStart) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: clubId, bookId, title, scheduledStart',
      });
    }

    // Проверяем, что пользователь является членом клуба
    const membership = await storage.getUserClubMembership(clubId, userId);
    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this club',
      });
    }

    // Проверяем, что книга существует
    const book = await storage.getBook(bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'Book not found',
      });
    }

    // Создаем расписание
    const schedule = await repositories.readingSchedule.createSchedule({
      clubId,
      bookId,
      title,
      description,
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
      estimatedDuration,
      startChapter,
      startPosition,
      endChapter,
      endPosition,
      isRecurring,
      recurringPattern,
      reminderMinutes,
      createdBy: userId,
    });

    res.json({
      success: true,
      schedule,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error creating schedule: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to create schedule',
    });
  }
});

/**
 * GET /api/schedule/:scheduleId
 * Получить расписание по ID
 */
router.get('/:scheduleId', async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;

    const schedule = await repositories.readingSchedule.getSchedule(scheduleId);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found',
      });
    }

    res.json({
      success: true,
      schedule,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting schedule: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get schedule',
    });
  }
});

/**
 * GET /api/schedule/club/:clubId
 * Получить расписание клуба
 */
router.get('/club/:clubId', async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;

    const schedules = await repositories.readingSchedule.getClubSchedule(clubId);

    res.json({
      success: true,
      schedules,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting club schedule: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get club schedule',
    });
  }
});

/**
 * GET /api/schedule/club/:clubId/upcoming
 * Получить предстоящие расписания клуба
 */
router.get('/club/:clubId/upcoming', async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;

    const schedules = await repositories.readingSchedule.getUpcomingSchedules(clubId);

    res.json({
      success: true,
      schedules,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting upcoming schedules: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get upcoming schedules',
    });
  }
});

/**
 * GET /api/schedule/club/:clubId/book/:bookId
 * Получить расписание по книге
 */
router.get('/club/:clubId/book/:bookId', async (req: Request, res: Response) => {
  try {
    const { clubId, bookId } = req.params;

    const schedules = await repositories.readingSchedule.getBookSchedules(clubId, bookId);

    res.json({
      success: true,
      schedules,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting book schedules: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get book schedules',
    });
  }
});

/**
 * GET /api/schedule/club/:clubId/status/:status
 * Получить расписания по статусу
 */
router.get('/club/:clubId/status/:status', async (req: Request, res: Response) => {
  try {
    const { clubId, status } = req.params;

    if (!isScheduleStatus(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: scheduled, in_progress, completed, cancelled',
      });
    }

    const schedules = await repositories.readingSchedule.getSchedulesByStatus(clubId, status);

    res.json({
      success: true,
      schedules,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting schedules by status: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get schedules by status',
    });
  }
});

/**
 * PUT /api/schedule/:scheduleId
 * Обновить расписание
 */
router.put('/:scheduleId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { scheduleId } = req.params;

    // Проверяем, что расписание существует
    const existingSchedule = await repositories.readingSchedule.getSchedule(scheduleId);
    if (!existingSchedule) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found',
      });
    }

    // Проверяем, что пользователь является создателем
    if (existingSchedule.createdBy !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the schedule creator can update it',
      });
    }

    const {
      title,
      description,
      scheduledStart,
      scheduledEnd,
      estimatedDuration,
      startChapter,
      startPosition,
      endChapter,
      endPosition,
      isRecurring,
      recurringPattern,
      reminderMinutes,
    } = req.body;

    const updatedSchedule = await repositories.readingSchedule.updateSchedule(scheduleId, {
      title,
      description,
      scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
      estimatedDuration,
      startChapter,
      startPosition,
      endChapter,
      endPosition,
      isRecurring,
      recurringPattern,
      reminderMinutes,
    });

    res.json({
      success: true,
      schedule: updatedSchedule,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating schedule: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update schedule',
    });
  }
});

/**
 * PUT /api/schedule/:scheduleId/status
 * Обновить статус расписания
 */
router.put('/:scheduleId/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { scheduleId } = req.params;
    const { status } = req.body;

    if (!status || !['scheduled', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: scheduled, in_progress, completed, cancelled',
      });
    }

    // Проверяем, что расписание существует
    const existingSchedule = await repositories.readingSchedule.getSchedule(scheduleId);
    if (!existingSchedule) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found',
      });
    }

    // Проверяем, что пользователь является создателем
    if (existingSchedule.createdBy !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the schedule creator can update the status',
      });
    }

    const updatedSchedule = await repositories.readingSchedule.updateScheduleStatus(scheduleId, status);

    res.json({
      success: true,
      schedule: updatedSchedule,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating schedule status: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update schedule status',
    });
  }
});

/**
 * POST /api/schedule/:scheduleId/start
 * Начать сессию по расписанию
 */
router.post('/:scheduleId/start', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { scheduleId } = req.params;

    const schedule = await getScheduleOrRespond(res, scheduleId);
    if (!schedule) {
      return;
    }

    if (!ensureScheduleCreator(res, schedule, userId, 'Only the schedule creator can start the session')) {
      return;
    }

    if (!ensureScheduleStatus(res, schedule, 'scheduled', 'Schedule is not in scheduled status')) {
      return;
    }

    // Создаем сессию чтения
    const session = await storage.readingSessions.createSession({
      clubId: schedule.clubId,
      bookId: schedule.bookId,
      userId,
      chapter: schedule.startChapter || 1,
      position: schedule.startPosition || '0',
      status: 'active',
    });

    if (!session) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create reading session',
      });
    }

    // Обновляем расписание и связываем с сессией
    const updatedSchedule = await repositories.readingSchedule.linkSession(scheduleId, session.id);

    await notifySessionStart(schedule, userId);

    res.json({
      success: true,
      session,
      schedule: updatedSchedule,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error starting session from schedule: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to start session from schedule',
    });
  }
});

/**
 * POST /api/schedule/:scheduleId/complete
 * Завершить сессию по расписанию
 */
router.post('/:scheduleId/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { scheduleId } = req.params;

    const schedule = await getScheduleOrRespond(res, scheduleId);
    if (!schedule) {
      return;
    }

    if (!ensureScheduleCreator(res, schedule, userId, 'Only the schedule creator can complete the session')) {
      return;
    }

    // Завершаем связанную сессию
    if (schedule.sessionId) {
      await storage.readingSessions.endSession(schedule.sessionId);
    }

    // Обновляем статус расписания
    const updatedSchedule = await repositories.readingSchedule.updateScheduleStatus(scheduleId, 'completed');

    await notifySessionEnd(schedule, userId);

    res.json({
      success: true,
      schedule: updatedSchedule,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error completing session from schedule: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to complete session from schedule',
    });
  }
});

/**
 * DELETE /api/schedule/:scheduleId
 * Удалить расписание
 */
router.delete('/:scheduleId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { scheduleId } = req.params;

    // Проверяем, что расписание существует
    const existingSchedule = await repositories.readingSchedule.getSchedule(scheduleId);
    if (!existingSchedule) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found',
      });
    }

    // Проверяем, что пользователь является создателем
    if (existingSchedule.createdBy !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the schedule creator can delete it',
      });
    }

    await repositories.readingSchedule.deleteSchedule(scheduleId);

    res.json({
      success: true,
      message: 'Schedule deleted successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error deleting schedule: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to delete schedule',
    });
  }
});

/**
 * GET /api/schedule/club/:clubId/stats
 * Получить статистику расписания клуба
 */
router.get('/club/:clubId/stats', async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;

    const stats = await repositories.readingSchedule.getClubScheduleStats(clubId);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting schedule stats: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get schedule stats',
    });
  }
});

export default router;
