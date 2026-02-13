import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc, gt, sql } from 'drizzle-orm';
import { readingSchedule, type ReadingSchedule, type InsertReadingSchedule } from '../../shared/schema.js';

/**
 * Репозиторий для расписания сессий чтения
 */
export class ReadingScheduleRepository extends BaseRepository {

  /**
   * Создать расписание
   */
  async createSchedule(schedule: InsertReadingSchedule & { clubId: string; createdBy: string }): Promise<ReadingSchedule> {
    try {
      const result = await this.db
        .insert(readingSchedule)
        .values(schedule)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('createSchedule', error);
      throw new Error('Failed to create schedule');
    }
  }

  /**
   * Получить расписание по ID
   */
  async getSchedule(id: string): Promise<ReadingSchedule | undefined> {
    try {
      const result = await this.db
        .select()
        .from(readingSchedule)
        .where(eq(readingSchedule.id, id))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getSchedule', error);
      throw new Error('Failed to get schedule');
    }
  }

  /**
   * Получить расписание клуба
   */
  async getClubSchedule(clubId: string): Promise<ReadingSchedule[]> {
    try {
      return await this.db
        .select()
        .from(readingSchedule)
        .where(eq(readingSchedule.clubId, clubId))
        .orderBy(desc(readingSchedule.scheduledStart));
    } catch (error) {
      this.logError('getClubSchedule', error);
      throw new Error('Failed to get club schedule');
    }
  }

  /**
   * Получить агрегированную статистику расписаний клуба
   */
  async getClubScheduleStats(clubId: string): Promise<{
    total: number;
    scheduled: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  }> {
    try {
      const [stats] = await this.db
        .select({
          total: sql<number>`COUNT(*)::int`,
          scheduled: sql<number>`COUNT(*) FILTER (WHERE ${readingSchedule.status} = 'scheduled')::int`,
          inProgress: sql<number>`COUNT(*) FILTER (WHERE ${readingSchedule.status} = 'in_progress')::int`,
          completed: sql<number>`COUNT(*) FILTER (WHERE ${readingSchedule.status} = 'completed')::int`,
          cancelled: sql<number>`COUNT(*) FILTER (WHERE ${readingSchedule.status} = 'cancelled')::int`,
        })
        .from(readingSchedule)
        .where(eq(readingSchedule.clubId, clubId));

      return {
        total: Number(stats?.total || 0),
        scheduled: Number(stats?.scheduled || 0),
        inProgress: Number(stats?.inProgress || 0),
        completed: Number(stats?.completed || 0),
        cancelled: Number(stats?.cancelled || 0),
      };
    } catch (error) {
      this.logError('getClubScheduleStats', error);
      throw new Error('Failed to get club schedule stats');
    }
  }

  /**
   * Получить предстоящие расписания клуба
   */
  async getUpcomingSchedules(clubId: string): Promise<ReadingSchedule[]> {
    try {
      const now = new Date();
      return await this.db
        .select()
        .from(readingSchedule)
        .where(and(
          eq(readingSchedule.clubId, clubId),
          eq(readingSchedule.status, 'scheduled'),
          gt(readingSchedule.scheduledStart, now)
        ))
        .orderBy(readingSchedule.scheduledStart);
    } catch (error) {
      this.logError('getUpcomingSchedules', error);
      throw new Error('Failed to get upcoming schedules');
    }
  }

  /**
   * Получить расписания, для которых прямо сейчас нужно отправить напоминание
   */
  async getSchedulesDueForReminder(now: Date, toleranceSeconds: number = 60): Promise<ReadingSchedule[]> {
    try {
      return await this.db
        .select()
        .from(readingSchedule)
        .where(and(
          eq(readingSchedule.status, 'scheduled'),
          eq(readingSchedule.remindersSent, false),
          gt(readingSchedule.scheduledStart, now),
          sql`ABS(
            EXTRACT(EPOCH FROM (${readingSchedule.scheduledStart} - ${now}))
            - (COALESCE(${readingSchedule.reminderMinutes}, 15) * 60)
          ) <= ${toleranceSeconds}`
        ))
        .orderBy(readingSchedule.scheduledStart);
    } catch (error) {
      this.logError('getSchedulesDueForReminder', error);
      throw new Error('Failed to get schedules due for reminder');
    }
  }

  /**
   * Получить расписания по статусу
   */
  async getSchedulesByStatus(clubId: string, status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'): Promise<ReadingSchedule[]> {
    try {
      return await this.db
        .select()
        .from(readingSchedule)
        .where(and(
          eq(readingSchedule.clubId, clubId),
          eq(readingSchedule.status, status)
        ))
        .orderBy(desc(readingSchedule.scheduledStart));
    } catch (error) {
      this.logError('getSchedulesByStatus', error);
      throw new Error('Failed to get schedules by status');
    }
  }

  /**
   * Получить расписания по книге
   */
  async getBookSchedules(clubId: string, bookId: string): Promise<ReadingSchedule[]> {
    try {
      return await this.db
        .select()
        .from(readingSchedule)
        .where(and(
          eq(readingSchedule.clubId, clubId),
          eq(readingSchedule.bookId, bookId)
        ))
        .orderBy(desc(readingSchedule.scheduledStart));
    } catch (error) {
      this.logError('getBookSchedules', error);
      throw new Error('Failed to get book schedules');
    }
  }

  /**
   * Обновить расписание
   */
  async updateSchedule(
    id: string,
    updates: Partial<Omit<InsertReadingSchedule, 'clubId' | 'createdBy'>>
  ): Promise<ReadingSchedule> {
    try {
      const result = await this.db
        .update(readingSchedule)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(readingSchedule.id, id))
        .returning();
      return result[0];
    } catch (error) {
      this.logError('updateSchedule', error);
      throw new Error('Failed to update schedule');
    }
  }

  /**
   * Обновить статус расписания
   */
  async updateScheduleStatus(
    id: string,
    status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(readingSchedule)
        .set({
          status,
          actualStart: status === 'in_progress' ? new Date() : undefined,
          actualEnd: status === 'completed' || status === 'cancelled' ? new Date() : undefined,
          updatedAt: new Date()
        })
        .where(eq(readingSchedule.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateScheduleStatus', error);
      throw new Error('Failed to update schedule status');
    }
  }

  /**
   * Привязать сессию к расписанию
   */
  async linkSession(id: string, sessionId: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(readingSchedule)
        .set({
          sessionId,
          status: 'in_progress',
          actualStart: new Date(),
          updatedAt: new Date()
        })
        .where(eq(readingSchedule.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('linkSession', error);
      throw new Error('Failed to link session');
    }
  }

  /**
   * Обновить количество участников
   */
  async updateAttendeesCount(id: string, count: number): Promise<boolean> {
    try {
      const result = await this.db
        .update(readingSchedule)
        .set({
          attendeesCount: count,
          updatedAt: new Date()
        })
        .where(eq(readingSchedule.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateAttendeesCount', error);
      throw new Error('Failed to update attendees count');
    }
  }

  /**
   * Отметить напоминания как отправленные
   */
  async markRemindersSent(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(readingSchedule)
        .set({
          remindersSent: true,
          updatedAt: new Date()
        })
        .where(eq(readingSchedule.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('markRemindersSent', error);
      throw new Error('Failed to mark reminders sent');
    }
  }

  /**
   * Удалить расписание
   */
  async deleteSchedule(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(readingSchedule)
        .where(eq(readingSchedule.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('deleteSchedule', error);
      throw new Error('Failed to delete schedule');
    }
  }
}
