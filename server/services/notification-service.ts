import { emailService } from './email-service.js';
import { storage } from '../repositories/index.js';
import { logger } from '../lib/logger.js';
import type { ReadingSchedule } from '../../shared/schema.js';
import { pushService, type PushNotificationType } from './push-service.js';

/**
 * NotificationService — сервис уведомлений для VoxLibris Studio
 *
 * Отвечает за:
 * - Напоминания о предстоящих сессиях
 * - Уведомления о начале/завершении сессий
 * - Настройки уведомлений пользователей
 */

export type NotificationChannel = 'email' | 'push' | 'websocket';

export interface NotificationSettings {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  reminderMinutes: number; // За сколько минут напоминать
  sessionStart: boolean; // Уведомлять о начале сессии
  sessionEnd: boolean; // Уведомлять о завершении сессии
  newQuestion: boolean; // Уведомлять о новых вопросах
  notifyReply: boolean; // Уведомлять об ответах на комментарии
  notifyMention: boolean; // Уведомлять об упоминаниях
  notifyChapterReady: boolean; // Уведомлять о готовности главы
  notifyMessage: boolean; // Уведомлять о личных сообщениях
  notifyPlanUpdate: boolean; // Уведомлять об изменениях плана
}

export interface NotificationPayload {
  type: 'session_reminder' | 'session_start' | 'session_end' | 'new_question' | 'new_reaction';
  userId: string;
  email?: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

class NotificationService {
  /**
   * Получить настройки уведомлений пользователя
   */
  async getUserNotificationSettings(userId: string): Promise<NotificationSettings> {
    try {
      const settings = await storage.getSettingsByCategory('notifications');

      // Базовые настройки
      const defaultSettings: NotificationSettings = {
        userId,
        emailEnabled: true,
        pushEnabled: true,
        reminderMinutes: 15,
        sessionStart: true,
        sessionEnd: false,
        newQuestion: true,
        notifyReply: true,
        notifyMention: true,
        notifyChapterReady: true,
        notifyMessage: true,
        notifyPlanUpdate: true,
      };

      // Применяем пользовательские настройки из БД
      settings.forEach((s: { key: string; value: string | null }) => {
        if (s.value) {
          switch (s.key) {
            case `notifications.${userId}.email_enabled`:
              defaultSettings.emailEnabled = s.value === 'true';
              break;
            case `notifications.${userId}.push_enabled`:
              defaultSettings.pushEnabled = s.value === 'true';
              break;
            case `notifications.${userId}.reminder_minutes`:
              defaultSettings.reminderMinutes = Number.parseInt(s.value, 10);
              break;
            case `notifications.${userId}.session_start`:
              defaultSettings.sessionStart = s.value === 'true';
              break;
            case `notifications.${userId}.session_end`:
              defaultSettings.sessionEnd = s.value === 'true';
              break;
            case `notifications.${userId}.new_question`:
              defaultSettings.newQuestion = s.value === 'true';
              break;
            case `notifications.${userId}.type.reply`:
              defaultSettings.notifyReply = s.value === 'true';
              break;
            case `notifications.${userId}.type.mention`:
              defaultSettings.notifyMention = s.value === 'true';
              break;
            case `notifications.${userId}.type.chapter_ready`:
              defaultSettings.notifyChapterReady = s.value === 'true';
              break;
            case `notifications.${userId}.type.message`:
              defaultSettings.notifyMessage = s.value === 'true';
              break;
            case `notifications.${userId}.type.plan_update`:
              defaultSettings.notifyPlanUpdate = s.value === 'true';
              break;
          }
        }
      });

      return defaultSettings;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting user notification settings');
      // Возвращаем настройки по умолчанию при ошибке
      return {
        userId,
        emailEnabled: true,
        pushEnabled: true,
        reminderMinutes: 15,
        sessionStart: true,
        sessionEnd: false,
        newQuestion: true,
        notifyReply: true,
        notifyMention: true,
        notifyChapterReady: true,
        notifyMessage: true,
        notifyPlanUpdate: true,
      };
    }
  }

  /**
   * Обновить настройки уведомлений пользователя
   */
  async updateUserNotificationSettings(
    userId: string,
    updates: Partial<NotificationSettings>
  ): Promise<boolean> {
    try {
      if (updates.emailEnabled !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.email_enabled`,
          value: String(updates.emailEnabled),
          category: 'notifications',
          updatedBy: userId,
        });
      }
      if (updates.pushEnabled !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.push_enabled`,
          value: String(updates.pushEnabled),
          category: 'notifications',
          updatedBy: userId,
        });
      }
      if (updates.reminderMinutes !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.reminder_minutes`,
          value: String(updates.reminderMinutes),
          category: 'notifications',
          updatedBy: userId,
        });
      }
      if (updates.sessionStart !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.session_start`,
          value: String(updates.sessionStart),
          category: 'notifications',
          updatedBy: userId,
        });
      }
      if (updates.sessionEnd !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.session_end`,
          value: String(updates.sessionEnd),
          category: 'notifications',
          updatedBy: userId,
        });
      }
      if (updates.newQuestion !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.new_question`,
          value: String(updates.newQuestion),
          category: 'notifications',
          updatedBy: userId,
        });
      }
      if (updates.notifyReply !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.type.reply`,
          value: String(updates.notifyReply),
          category: 'notifications',
          updatedBy: userId,
        });
      }
      if (updates.notifyMention !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.type.mention`,
          value: String(updates.notifyMention),
          category: 'notifications',
          updatedBy: userId,
        });
      }
      if (updates.notifyChapterReady !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.type.chapter_ready`,
          value: String(updates.notifyChapterReady),
          category: 'notifications',
          updatedBy: userId,
        });
      }
      if (updates.notifyMessage !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.type.message`,
          value: String(updates.notifyMessage),
          category: 'notifications',
          updatedBy: userId,
        });
      }
      if (updates.notifyPlanUpdate !== undefined) {
        await storage.setSetting({
          key: `notifications.${userId}.type.plan_update`,
          value: String(updates.notifyPlanUpdate),
          category: 'notifications',
          updatedBy: userId,
        });
      }

      logger.info({ updates }, `Notification settings updated for user ${userId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error updating user notification settings');
      return false;
    }
  }

  /**
   * Отправить уведомление
   */
  async sendNotification(payload: NotificationPayload, channels: NotificationChannel[]): Promise<boolean> {
    try {
      const settings = await this.getUserNotificationSettings(payload.userId);

      let success = false;

      // Email
      if (channels.includes('email') && settings.emailEnabled && payload.email) {
        const emailSuccess = await this.sendEmailNotification(payload);
        success = success || emailSuccess;
      }

      // Browser Web Push
      if (channels.includes('push') && settings.pushEnabled) {
        const pushType = this.mapPayloadTypeToPushType(payload.type);
        const pushResult = await pushService.sendToUser(payload.userId, {
          type: pushType,
          title: payload.title,
          body: payload.message,
          url: typeof payload.data?.url === 'string' ? payload.data.url : '/dashboard',
          tag: pushType,
        });
        success = success || pushResult.sent > 0;
      }

      // WebSocket (отправляем в реальном времени)
      if (channels.includes('websocket')) {
        // WebSocket уведомления отправляются через websocket.ts
        // Здесь мы просто логируем для отладки
        logger.debug(`WebSocket notification for user ${payload.userId}: ${payload.title}`);
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error sending notification');
      return false;
    }
  }

  private mapPayloadTypeToPushType(type: NotificationPayload['type']): PushNotificationType {
    switch (type) {
      case 'session_reminder':
        return 'session_reminder';
      case 'session_start':
        return 'session_started';
      case 'new_question':
      case 'new_reaction':
        return 'mention_in_chat';
      case 'session_end':
      default:
        return 'club_discussion';
    }
  }

  /**
   * Отправить email-уведомление
   */
  private async sendEmailNotification(payload: NotificationPayload): Promise<boolean> {
    try {
      if (!payload.email) {
        return false;
      }

      // В зависимости от типа уведомления формируем HTML
      let html: string;
      let subject: string;

      switch (payload.type) {
        case 'session_reminder':
          subject = `📚 Напоминание: ${payload.title}`;
          html = this.getSessionReminderHtml(payload);
          break;
        case 'session_start':
          subject = `🎙️ Сессия началась: ${payload.title}`;
          html = this.getSessionStartHtml(payload);
          break;
        case 'session_end':
          subject = `✅ Сессия завершена: ${payload.title}`;
          html = this.getSessionEndHtml(payload);
          break;
        case 'new_question':
          subject = `❓ Новый вопрос: ${payload.title}`;
          html = this.getNewQuestionHtml(payload);
          break;
        default:
          subject = payload.title;
          html = this.getDefaultHtml(payload);
      }

      return await emailService.sendEmail({
        to: payload.email,
        subject,
        html,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error sending email notification');
      return false;
    }
  }

  /**
   * Напоминание о предстоящей сессии
   */
  async sendSessionReminder(
    schedule: ReadingSchedule,
    userId: string,
    email: string
  ): Promise<boolean> {
    const payload: NotificationPayload = {
      type: 'session_reminder',
      userId,
      email,
      title: schedule.title,
      message: `Сессия "${schedule.title}" начнется через 15 минут`,
      data: {
        scheduleId: schedule.id,
        clubId: schedule.clubId,
        bookId: schedule.bookId,
        scheduledStart: schedule.scheduledStart,
      },
    };

    return await this.sendNotification(payload, ['email']);
  }

  /**
   * Уведомление о начале сессии
   */
  async sendSessionStartNotification(
    schedule: ReadingSchedule,
    userId: string,
    email: string
  ): Promise<boolean> {
    const payload: NotificationPayload = {
      type: 'session_start',
      userId,
      email,
      title: schedule.title,
      message: `Сессия "${schedule.title}" началась! Подключайтесь.`,
      data: {
        scheduleId: schedule.id,
        clubId: schedule.clubId,
        bookId: schedule.bookId,
      },
    };

    return await this.sendNotification(payload, ['email', 'websocket']);
  }

  /**
   * Уведомление о завершении сессии
   */
  async sendSessionEndNotification(
    schedule: ReadingSchedule,
    userId: string,
    email: string
  ): Promise<boolean> {
    const payload: NotificationPayload = {
      type: 'session_end',
      userId,
      email,
      title: schedule.title,
      message: `Сессия "${schedule.title}" завершена`,
      data: {
        scheduleId: schedule.id,
        clubId: schedule.clubId,
        bookId: schedule.bookId,
      },
    };

    return await this.sendNotification(payload, ['email']);
  }

  /**
   * HTML для напоминания о сессии
   */
  private getSessionReminderHtml(payload: NotificationPayload): string {
    const data = payload.data as { scheduledStart?: string; clubId?: string } | undefined;
    const scheduledTime = data?.scheduledStart
      ? new Date(data.scheduledStart).toLocaleString('ru-RU', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'скоро';

    return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Напоминание о сессии — VoxLibris</title>
  <style>
    body { font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #3D2B1F; background: #F5F2ED; }
    .wrapper { max-width: 600px; margin: 40px auto; padding: 0 20px; }
    .card { background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(92, 64, 51, 0.08); }
    .header { background: #5C4033; padding: 32px 40px; text-align: center; }
    .header h1 { font-family: "Playfair Display", serif; font-size: 24px; font-weight: 600; color: #FFFFFF; margin: 0; }
    .body { padding: 40px; }
    .body h2 { font-family: "Playfair Display", serif; font-size: 20px; font-weight: 600; color: #5C4033; margin: 0 0 16px; }
    .body p { margin: 0 0 16px; color: #3D2B1F; }
    .info-box { background: #F7F3ED; border-left: 4px solid #D4A574; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .info-box strong { color: #5C4033; }
    .btn { display: inline-block; background: #D4A574; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-top: 16px; }
    .btn:hover { background: #C49564; }
    .footer { padding: 24px 40px; text-align: center; border-top: 1px solid #E8DFD5; background: #F7F3ED; }
    .footer p { font-size: 13px; color: #8B7355; margin: 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>📚 Напоминание о сессии</h1>
      </div>
      <div class="body">
        <h2>${payload.title}</h2>
        <p>${payload.message}</p>
        
        <div class="info-box">
          <p><strong>📅 Дата и время:</strong> ${scheduledTime}</p>
        </div>
        
        <p>Не забудьте подключиться вовремя!</p>
      </div>
      <div class="footer">
        <p>VoxLibris — Платформа для книжных клубов</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * HTML для уведомления о начале сессии
   */
  private getSessionStartHtml(payload: NotificationPayload): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Сессия началась — VoxLibris</title>
  <style>
    body { font-family: sans-serif; background: #F5F2ED; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(92, 64, 51, 0.08); }
    h1 { color: #5C4033; margin: 0 0 16px; }
    p { color: #3D2B1F; margin: 0 0 16px; }
    .btn { display: inline-block; background: #D4A574; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🎙️ ${payload.title}</h1>
    <p>${payload.message}</p>
    <a href="#" class="btn">Подключиться к сессии</a>
  </div>
</body>
</html>
    `;
  }

  /**
   * HTML для уведомления о завершении сессии
   */
  private getSessionEndHtml(payload: NotificationPayload): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Сессия завершена — VoxLibris</title>
  <style>
    body { font-family: sans-serif; background: #F5F2ED; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(92, 64, 51, 0.08); }
    h1 { color: #5C4033; margin: 0 0 16px; }
    p { color: #3D2B1F; margin: 0 0 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✅ ${payload.title}</h1>
    <p>${payload.message}</p>
    <p>Спасибо за участие!</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * HTML для уведомления о новом вопросе
   */
  private getNewQuestionHtml(payload: NotificationPayload): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Новый вопрос — VoxLibris</title>
  <style>
    body { font-family: sans-serif; background: #F5F2ED; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(92, 64, 51, 0.08); }
    h1 { color: #5C4033; margin: 0 0 16px; }
    p { color: #3D2B1F; margin: 0 0 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>❓ ${payload.title}</h1>
    <p>${payload.message}</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * HTML по умолчанию
   */
  private getDefaultHtml(payload: NotificationPayload): string {
    return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Уведомление — VoxLibris</title>
  <style>
    body { font-family: sans-serif; background: #F5F2ED; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(92, 64, 51, 0.08); }
    h1 { color: #5C4033; margin: 0 0 16px; }
    p { color: #3D2B1F; margin: 0 0 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${payload.title}</h1>
    <p>${payload.message}</p>
  </div>
</body>
</html>
    `;
  }
}

// Экспортируем singleton
export const notificationService = new NotificationService();
