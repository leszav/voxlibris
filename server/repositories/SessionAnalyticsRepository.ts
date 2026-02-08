import { BaseRepository } from './BaseRepository.js';
import { eq } from 'drizzle-orm';
import { sessionAnalytics, type SessionAnalytics, type InsertSessionAnalytics } from '../../shared/schema.js';

/**
 * Репозиторий для аналитики сессий чтения
 */
export class SessionAnalyticsRepository extends BaseRepository {

  /**
   * Создать аналитику сессии
   */
  async createSessionAnalytics(analytics: InsertSessionAnalytics & { sessionId: string }): Promise<SessionAnalytics> {
    try {
      const result = await this.db
        .insert(sessionAnalytics)
        .values(analytics)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('createSessionAnalytics', error);
      throw new Error('Failed to create session analytics');
    }
  }

  /**
   * Получить аналитику сессии
   */
  async getSessionAnalytics(sessionId: string): Promise<SessionAnalytics | undefined> {
    try {
      const result = await this.db
        .select()
        .from(sessionAnalytics)
        .where(eq(sessionAnalytics.sessionId, sessionId))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getSessionAnalytics', error);
      throw new Error('Failed to get session analytics');
    }
  }

  /**
   * Обновить статистику слушателей
   */
  async updateListenerStats(
    sessionId: string,
    peakListenerCount?: number,
    averageListenerCount?: number,
    totalListeners?: number
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionAnalytics)
        .set({
          peakListenerCount,
          averageListenerCount,
          totalListeners,
          updatedAt: new Date()
        })
        .where(eq(sessionAnalytics.sessionId, sessionId))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateListenerStats', error);
      throw new Error('Failed to update listener stats');
    }
  }

  /**
   * Обновить время прослушивания
   */
  async updateListenTime(
    sessionId: string,
    totalListenTime: number,
    averageSessionDuration: number
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionAnalytics)
        .set({
          totalListenTime,
          averageSessionDuration,
          updatedAt: new Date()
        })
        .where(eq(sessionAnalytics.sessionId, sessionId))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateListenTime', error);
      throw new Error('Failed to update listen time');
    }
  }

  /**
   * Обновить счётчики реакций и вопросов
   */
  async updateReactionQuestionStats(
    sessionId: string,
    reactionCount: number,
    positiveReactionCount: number,
    negativeReactionCount: number,
    questionCount: number
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionAnalytics)
        .set({
          reactionCount,
          positiveReactionCount,
          negativeReactionCount,
          questionCount,
          updatedAt: new Date()
        })
        .where(eq(sessionAnalytics.sessionId, sessionId))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateReactionQuestionStats', error);
      throw new Error('Failed to update reaction question stats');
    }
  }

  /**
   * Обновить показатели качества
   */
  async updateQualityScores(
    sessionId: string,
    audioQualityScore?: number,
    networkQualityScore?: number
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionAnalytics)
        .set({
          audioQualityScore,
          networkQualityScore,
          updatedAt: new Date()
        })
        .where(eq(sessionAnalytics.sessionId, sessionId))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateQualityScores', error);
      throw new Error('Failed to update quality scores');
    }
  }

  /**
   * Обновить метаданные (география, устройства, удержание)
   */
  async updateMetadata(
    sessionId: string,
    metadata: Partial<{
      listenerRegions: string;
      listenerCities: string;
      deviceTypes: string;
      retention: string;
      metadata: string;
    }>
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionAnalytics)
        .set({
          ...metadata,
          updatedAt: new Date()
        })
        .where(eq(sessionAnalytics.sessionId, sessionId))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateMetadata', error);
      throw new Error('Failed to update metadata');
    }
  }

  /**
   * Удалить аналитику сессии
   */
  async deleteSessionAnalytics(sessionId: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(sessionAnalytics)
        .where(eq(sessionAnalytics.sessionId, sessionId))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('deleteSessionAnalytics', error);
      throw new Error('Failed to delete session analytics');
    }
  }
}
