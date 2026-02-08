import cron from 'node-cron';
import { repositories } from '../repositories/index.js';
import { notificationService } from './notification-service.js';
import { logger } from '../lib/logger.js';
import type { ReadingSchedule } from '../../shared/schema.js';

/**
 * Scheduler — планировщик фоновых задач для VoxLibris Studio
 *
 * Отвечает за:
 * - Периодическую проверку расписания для напоминаний
 * - Отправку напоминаний о предстоящих сессиях
 * - Очистку устаревших данных
 */

class Scheduler {
  private readonly tasks: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;

  /**
   * Запустить планировщик
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    logger.info('Starting scheduler...');

    // Проверка расписания каждую минуту
    this.scheduleTask('check-schedule', '* * * * *', this.checkSchedule.bind(this));

    // Очистка старых данных каждый час
    this.scheduleTask('cleanup-old-data', '0 * * * *', this.cleanupOldData.bind(this));

    this.isRunning = true;
    logger.info('Scheduler started successfully');
  }

  /**
   * Остановить планировщик
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Scheduler is not running');
      return;
    }

    logger.info('Stopping scheduler...');

    this.tasks.forEach((task, name) => {
      task.stop();
      logger.debug(`Task ${name} stopped`);
    });

    this.tasks.clear();
    this.isRunning = false;
    logger.info('Scheduler stopped');
  }

  /**
   * Зарегистрировать задачу
   */
  private scheduleTask(name: string, cronExpression: string, handler: () => Promise<void>): void {
    try {
      const task = cron.schedule(cronExpression, async () => {
        try {
          await handler();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error({ error: errorMessage }, `Error executing task ${name}`);
        }
      }, {
        scheduled: true,
        timezone: 'UTC',
      });

      this.tasks.set(name, task);
      logger.info(`Task ${name} scheduled with cron: ${cronExpression}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, `Error scheduling task ${name}`);
    }
  }

  /**
   * Проверить расписание и отправить напоминания
   */
  private async checkSchedule(): Promise<void> {
    try {
      const now = new Date();

      // Получаем все расписания со статусом "scheduled"
      // Для простоты проверяем все клубы. В продакшене можно оптимизировать.
      const clubs = await repositories.clubs.getClubs();

      for (const club of clubs) {
        await this.checkClubSchedules(club.id, now);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error checking schedule');
    }
  }

  private async checkClubSchedules(clubId: string, now: Date): Promise<void> {
    try {
      const schedules = await repositories.readingSchedule.getClubSchedule(clubId);

      for (const schedule of schedules) {
        if (!this.shouldSendReminder(schedule, now)) {
          continue;
        }

        await this.sendReminders(schedule);
      }
    } catch (clubError) {
      const errorMessage = clubError instanceof Error ? clubError.message : String(clubError);
      logger.error({ error: errorMessage }, `Error checking schedule for club ${clubId}`);
    }
  }

  private shouldSendReminder(schedule: ReadingSchedule, now: Date): boolean {
    if (schedule.remindersSent) {
      return false;
    }

    if (schedule.status !== 'scheduled' || !schedule.scheduledStart) {
      return false;
    }

    const scheduledStart = new Date(schedule.scheduledStart);
    if (scheduledStart <= now) {
      return false;
    }

    const timeDiff = scheduledStart.getTime() - now.getTime();
    const reminderMinutes = schedule.reminderMinutes ?? 15;
    const reminderThreshold = reminderMinutes * 60 * 1000;
    const tolerance = 60 * 1000; // 1 минута допуска

    return Math.abs(timeDiff - reminderThreshold) <= tolerance;
  }

  /**
   * Отправить напоминания всем участникам клуба
   */
  private async sendReminders(schedule: ReadingSchedule): Promise<void> {
    try {
      logger.info(`Sending reminders for schedule ${schedule.id}: ${schedule.title}`);

      // Получаем участников клуба
      const memberships = await repositories.clubs.getClubMembers(schedule.clubId);

      if (!memberships || memberships.length === 0) {
        logger.warn(`No members found for club ${schedule.clubId}`);
        return;
      }

      let sentCount = 0;
      let failedCount = 0;

      for (const membership of memberships) {
        try {
          if (!membership.email) {
            continue;
          }

          // Отправляем напоминание
          const success = await notificationService.sendSessionReminder(
            schedule,
            membership.id,
            membership.email
          );

          if (success) {
            sentCount++;
            logger.debug(`Reminder sent to ${membership.email}`);
          } else {
            failedCount++;
            logger.warn(`Failed to send reminder to ${membership.email}`);
          }
        } catch (userError) {
          const errorMessage = userError instanceof Error ? userError.message : String(userError);
          logger.error({ error: errorMessage }, `Error sending reminder to user ${membership.id}`);
          failedCount++;
        }
      }

      // Обновляем флаг отправки напоминаний
      await repositories.readingSchedule.markRemindersSent(schedule.id);

      logger.info(
        `Reminders sent for schedule ${schedule.id}: ${sentCount} successful, ${failedCount} failed`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, `Error sending reminders for schedule ${schedule.id}`);
    }
  }

  /**
   * Очистка старых данных
   */
  private async cleanupOldData(): Promise<void> {
    try {
      logger.info('Running cleanup of old data...');
      // Пока нет массовых операций очистки; оставляем как no-op.
      logger.debug('Cleanup completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error cleaning up old data');
    }
  }

  /**
   * Ручной запуск проверки расписания (для тестирования)
   */
  async manualCheckSchedule(): Promise<void> {
    logger.info('Manual schedule check triggered');
    await this.checkSchedule();
  }
}

// Экспортируем singleton
export const scheduler = new Scheduler();
