import cron from 'node-cron';
import { repositories } from '../repositories/index.js';
import * as GuestRepo from '../repositories/GuestRepository.js';
import { notificationService } from './notification-service.js';
import { clubPopularityService } from './club-popularity-service.js';
import { gamificationService } from './gamification-service.js';
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
  private readonly timezone = process.env.SCHEDULER_TIMEZONE || process.env.TZ || 'UTC';

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

    // Пересчет популярности клубов каждый час
    this.scheduleTask('update-club-popularity', '0 * * * *', this.updateClubPopularity.bind(this));

    // Очистка ЛС по retention-политике ежедневно в 00:10
    this.scheduleTask('cleanup-dm-retention', '10 0 * * *', this.cleanupDirectMessagesRetention.bind(this));

    // Пересчет стриков геймификации ежедневно в 03:00
    this.scheduleTask('check-gamification-streaks', '0 3 * * *', this.checkGamificationStreaks.bind(this));

    // Полный reconcile геймификации ежедневно в 03:20
    this.scheduleTask('reconcile-gamification', '20 3 * * *', this.reconcileGamification.bind(this));

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
        timezone: this.timezone,
      });

      this.tasks.set(name, task);
      logger.info(`Task ${name} scheduled with cron: ${cronExpression} (timezone: ${this.timezone})`);
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
      const dueSchedules = await repositories.readingSchedule.getSchedulesDueForReminder(now);

      for (const schedule of dueSchedules) {
        await this.sendReminders(schedule);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error checking schedule');
    }
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
   * Очистка старых данных (включая guest систему)
   */
  private async cleanupOldData(): Promise<void> {
    try {
      logger.info('Running cleanup of old data...');

      // Очистка просроченных гостевых книг
      const expiredBooks = await GuestRepo.cleanupExpiredGuestBooks();
      logger.info({ expiredBooks }, 'Cleaned up expired guest books');

      // Очистка просроченных гостевых аккаунтов
      const expiredAccounts = await GuestRepo.cleanupExpiredGuestAccounts();
      logger.info({ expiredAccounts }, 'Cleaned up expired guest accounts');

      // Очистка старой аналитики (>90 дней)
      const oldAnalytics = await GuestRepo.cleanupOldAnalytics(90);
      logger.info({ oldAnalytics }, 'Cleaned up old guest analytics');

      logger.info('Guest cleanup completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error cleaning up old data');
    }
  }

  /**
   * Обновление популярности клубов
   * Выполняется каждый час для пересчета popularity score
   */
  private async updateClubPopularity(): Promise<void> {
    try {
      logger.info('Starting club popularity update...');
      const updatedCount = await clubPopularityService.updateAllClubsPopularity();
      logger.info(`Club popularity update completed: ${updatedCount} clubs updated`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error updating club popularity');
    }
  }

  /**
   * Ежедневная очистка ЛС по retention-политике
   */
  async cleanupDirectMessagesRetention(batchSizeOverride?: number): Promise<void> {
    try {
      const batchSize = Number.parseInt(process.env.DM_RETENTION_CLEANUP_BATCH_SIZE || '3000', 10);
      const fromEnv = Number.isFinite(batchSize) ? batchSize : 3000;
      const fromOverride = Number.isFinite(batchSizeOverride) ? Math.trunc(batchSizeOverride as number) : null;
      const resolvedBatchSize = fromOverride && fromOverride > 0 ? fromOverride : fromEnv;
      const stats = await repositories.dm.runRetentionCleanup({
        batchSize: resolvedBatchSize,
      });

      logger.info(
        {
          softDeleted: stats.softDeleted,
          hardDeleted: stats.hardDeleted,
          durationMs: stats.durationMs,
          batchSize: stats.batchSize,
          adminMaxDays: stats.adminMaxDays,
          hardDeleteGraceDays: stats.hardDeleteGraceDays,
        },
        'DM retention cleanup completed',
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error cleaning up DM retention');
    }
  }

  /**
   * Ручной запуск проверки расписания (для тестирования)
   */
  async manualCheckSchedule(): Promise<void> {
    logger.info('Manual schedule check triggered');
    await this.checkSchedule();
  }

  async manualRunDmRetentionCleanup(batchSize?: number): Promise<void> {
    logger.info({ batchSize }, 'Manual DM retention cleanup triggered');
    await this.cleanupDirectMessagesRetention(batchSize);
  }

  async manualRunGamificationStreaksCheck(): Promise<void> {
    logger.info('Manual gamification streaks check triggered');
    await this.checkGamificationStreaks();
  }

  async manualRunGamificationReconcile(batchSize?: number, maxUsers?: number): Promise<void> {
    logger.info({ batchSize, maxUsers }, 'Manual gamification reconcile triggered');
    await this.reconcileGamification(batchSize, maxUsers);
  }

  private async checkGamificationStreaks(): Promise<void> {
    try {
      const resetCount = await gamificationService.checkStreaksDaily();
      logger.info({ resetCount }, 'Gamification streak check completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error checking gamification streaks');
    }
  }

  private async reconcileGamification(batchSizeOverride?: number, maxUsersOverride?: number): Promise<void> {
    try {
      const batchSizeFromEnv = Number.parseInt(process.env.GAMIFICATION_RECONCILE_BATCH_SIZE || '150', 10);
      const maxUsersFromEnv = Number.parseInt(process.env.GAMIFICATION_RECONCILE_MAX_USERS || '0', 10);

      let batchSize = 150;
      if (Number.isFinite(batchSizeFromEnv) && batchSizeFromEnv > 0) {
        batchSize = batchSizeFromEnv;
      }
      if (typeof batchSizeOverride === 'number' && Number.isFinite(batchSizeOverride) && batchSizeOverride > 0) {
        batchSize = Math.trunc(batchSizeOverride);
      }

      let maxUsers: number | undefined;
      if (Number.isFinite(maxUsersFromEnv) && maxUsersFromEnv > 0) {
        maxUsers = maxUsersFromEnv;
      }
      if (typeof maxUsersOverride === 'number' && Number.isFinite(maxUsersOverride) && maxUsersOverride > 0) {
        maxUsers = Math.trunc(maxUsersOverride);
      }

      const summary = await gamificationService.reconcileUsers({
        batchSize,
        maxUsers,
        reason: 'scheduler_nightly_reconcile',
      });

      logger.info({
        ...summary,
        batchSize,
        maxUsers: maxUsers ?? null,
      }, 'Gamification reconcile completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error reconciling gamification');
    }
  }
}

// Экспортируем singleton
export const scheduler = new Scheduler();
