import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc } from 'drizzle-orm';
import { clubReadingStatus, type ClubReadingStatus, type InsertClubReadingStatus, type SessionType } from '../../shared/schema.js';

/**
 * Репозиторий для статусов чтения в клубах (поддержка множественных чтецов)
 */
export class ClubReadingStatusRepository extends BaseRepository {

  /**
   * Создать статус чтения
   */
  async createReadingStatus(status: InsertClubReadingStatus & { userId: string; sessionType?: SessionType }): Promise<ClubReadingStatus> {
    try {
      const result = await this.db
        .insert(clubReadingStatus)
        .values(status)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('createReadingStatus', error);
      throw new Error('Failed to create reading status');
    }
  }

  /**
   * Получить статус чтения по ID
   */
  async getReadingStatus(id: string): Promise<ClubReadingStatus | undefined> {
    try {
      const result = await this.db
        .select()
        .from(clubReadingStatus)
        .where(eq(clubReadingStatus.id, id))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getReadingStatus', error);
      throw new Error('Failed to get reading status');
    }
  }

  /**
   * Получить статус чтения по sessionId
   */
  async getReadingStatusBySessionId(sessionId: string): Promise<ClubReadingStatus | undefined> {
    try {
      const result = await this.db
        .select()
        .from(clubReadingStatus)
        .where(eq(clubReadingStatus.sessionId, sessionId))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getReadingStatusBySessionId', error);
      throw new Error('Failed to get reading status by session id');
    }
  }

  /**
   * Получить все активные статусы чтения в клубе
   */
  async getActiveReadingStatusesInClub(clubId: string): Promise<ClubReadingStatus[]> {
    try {
      return await this.db
        .select()
        .from(clubReadingStatus)
        .where(and(
          eq(clubReadingStatus.clubId, clubId),
          eq(clubReadingStatus.isActive, true)
        ))
        .orderBy(desc(clubReadingStatus.startedAt));
    } catch (error) {
      this.logError('getActiveReadingStatusesInClub', error);
      throw new Error('Failed to get active reading statuses in club');
    }
  }

  /**
   * Получить текущий статус чтения пользователя в клубе
   */
  async getUserReadingStatusInClub(clubId: string, userId: string): Promise<ClubReadingStatus | undefined> {
    try {
      const result = await this.db
        .select()
        .from(clubReadingStatus)
        .where(and(
          eq(clubReadingStatus.clubId, clubId),
          eq(clubReadingStatus.userId, userId),
          eq(clubReadingStatus.isActive, true)
        ))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getUserReadingStatusInClub', error);
      throw new Error('Failed to get user reading status in club');
    }
  }

  /**
   * Начать чтение (активировать статус)
   */
  async startReading(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubReadingStatus)
        .set({
          isActive: true,
          startedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(clubReadingStatus.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('startReading', error);
      throw new Error('Failed to start reading');
    }
  }

  /**
   * Остановить чтение (деактивировать статус)
   */
  async stopReading(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubReadingStatus)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(eq(clubReadingStatus.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('stopReading', error);
      throw new Error('Failed to stop reading');
    }
  }

  /**
   * Обновить позицию чтения
   */
  async updateReadingPosition(
    id: string,
    currentChapter: number,
    currentPosition: string
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubReadingStatus)
        .set({
          currentChapter,
          currentPosition,
          updatedAt: new Date()
        })
        .where(eq(clubReadingStatus.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateReadingPosition', error);
      throw new Error('Failed to update reading position');
    }
  }

  /**
   * Обновить количество слушателей
   */
  async updateListenerCount(id: string, count: number): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubReadingStatus)
        .set({
          listenerCount: count,
          updatedAt: new Date()
        })
        .where(eq(clubReadingStatus.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateListenerCount', error);
      throw new Error('Failed to update listener count');
    }
  }

  /**
   * Обновить статус доступности для слушателей
   */
  async updateOpenForListeners(id: string, isOpen: boolean): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubReadingStatus)
        .set({
          isOpenForListeners: isOpen,
          updatedAt: new Date()
        })
        .where(eq(clubReadingStatus.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateOpenForListeners', error);
      throw new Error('Failed to update open for listeners');
    }
  }

  /**
   * Получить все статусы чтения пользователя
   */
  async getUserReadingStatuses(userId: string): Promise<ClubReadingStatus[]> {
    try {
      return await this.db
        .select()
        .from(clubReadingStatus)
        .where(eq(clubReadingStatus.userId, userId))
        .orderBy(desc(clubReadingStatus.updatedAt));
    } catch (error) {
      this.logError('getUserReadingStatuses', error);
      throw new Error('Failed to get user reading statuses');
    }
  }
}
