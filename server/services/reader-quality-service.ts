import { storage, repositories } from '../repositories/index.js';
import { logger } from '../lib/logger.js';

/**
 * ReaderQualityService — сервис оценок качества чтения
 *
 * Отвечает за:
 * - Создание и обновление оценок чтецов
 * - Расчёт среднего рейтинга чтеца
 * - Получение отзывов и статистики
 * - Проверка прав на оценку
 */

export interface ReaderQualityRatingData {
  ratedUserId: string; // Чтец
  raterUserId: string; // Слушатель
  clubId: string;
  sessionId: string;
  voiceQuality?: number; // 1-5
  readingPace?: number; // 1-5
  articulation?: number; // 1-5
  emotion?: number; // 1-5
  overallRating: number; // 1-5 (обязательно)
  feedback?: string; // Текстовый отзыв
}

export interface ReaderQualityStats {
  overall: number;
  voiceQuality: number;
  readingPace: number;
  articulation: number;
  emotion: number;
  totalRatings: number;
  recentRatings: number; // Количество оценок за последние 30 дней
}

class ReaderQualityService {
  /**
   * Создать оценку чтеца
   */
  async createRating(data: ReaderQualityRatingData): Promise<{ ratingId: string; averageRating: ReaderQualityStats }> {
    try {
      // Проверяем, что пользователь не оценивает сам себя
      if (data.ratedUserId === data.raterUserId) {
        throw new Error('Cannot rate yourself');
      }

      // Проверяем, что пользователь был слушателем сессии
      const session = await storage.getReadingSession(data.sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      if (session.clubId !== data.clubId) {
        throw new Error('Session does not belong to this club');
      }

      if (session.readerId !== data.ratedUserId) {
        throw new Error('User was not the reader in this session');
      }

      // Проверяем, что пользователь участвовал в сессии как слушатель
      const listeners = await repositories.reading.getSessionListeners(data.sessionId);
      const wasListener = listeners.some((listener) => listener.id === data.raterUserId);
      if (!wasListener) {
        throw new Error('User was not a listener in this session');
      }

      // Проверяем, что оценка ещё не существует
      const existingRating = await repositories.readerQualityRatings.getUserRatingForReaderInClub(
        data.raterUserId,
        data.ratedUserId,
        data.clubId
      );

      if (existingRating) {
        throw new Error('You have already rated this reader in this club');
      }

      // Валидация оценок (1-5)
      this.validateRating(data.overallRating, 'overallRating');
      if (data.voiceQuality !== undefined) this.validateRating(data.voiceQuality, 'voiceQuality');
      if (data.readingPace !== undefined) this.validateRating(data.readingPace, 'readingPace');
      if (data.articulation !== undefined) this.validateRating(data.articulation, 'articulation');
      if (data.emotion !== undefined) this.validateRating(data.emotion, 'emotion');

      // Создаём оценку
      const rating = await repositories.readerQualityRatings.createRating({
        ratedUserId: data.ratedUserId,
        raterUserId: data.raterUserId,
        clubId: data.clubId,
        voiceQuality: data.voiceQuality,
        readingPace: data.readingPace,
        articulation: data.articulation,
        emotion: data.emotion,
        overallRating: data.overallRating,
        feedback: data.feedback,
      });

      // Рассчитываем средний рейтинг
      const averageRating = await this.getReaderQualityStats(data.ratedUserId);

      logger.info(`Rating created: ${rating.id} for reader ${data.ratedUserId}`);

      return {
        ratingId: rating.id,
        averageRating,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error creating rating');
      throw error;
    }
  }

  /**
   * Обновить оценку
   */
  async updateRating(
    ratingId: string,
    raterUserId: string,
    updates: Partial<Pick<ReaderQualityRatingData, 'voiceQuality' | 'readingPace' | 'articulation' | 'emotion' | 'overallRating' | 'feedback'>>
  ): Promise<{ ratingId: string; averageRating: ReaderQualityStats }> {
    try {
      // Получаем оценку
      const rating = await repositories.readerQualityRatings.getRating(ratingId);
      if (!rating) {
        throw new Error('Rating not found');
      }

      // Проверяем права (только автор оценки может обновлять)
      if (rating.raterUserId !== raterUserId) {
        throw new Error('You can only update your own ratings');
      }

      // Валидация оценок
      if (updates.overallRating !== undefined) {
        this.validateRating(updates.overallRating, 'overallRating');
      }
      if (updates.voiceQuality !== undefined) {
        this.validateRating(updates.voiceQuality, 'voiceQuality');
      }
      if (updates.readingPace !== undefined) {
        this.validateRating(updates.readingPace, 'readingPace');
      }
      if (updates.articulation !== undefined) {
        this.validateRating(updates.articulation, 'articulation');
      }
      if (updates.emotion !== undefined) {
        this.validateRating(updates.emotion, 'emotion');
      }

      // Обновляем оценку
      await repositories.readerQualityRatings.updateRating(ratingId, updates);

      // Рассчитываем средний рейтинг
      const averageRating = await this.getReaderQualityStats(rating.ratedUserId);

      logger.info(`Rating updated: ${ratingId}`);

      return {
        ratingId,
        averageRating,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error updating rating');
      throw error;
    }
  }

  /**
   * Удалить оценку
   */
  async deleteRating(ratingId: string, raterUserId: string): Promise<boolean> {
    try {
      // Получаем оценку
      const rating = await repositories.readerQualityRatings.getRating(ratingId);
      if (!rating) {
        throw new Error('Rating not found');
      }

      // Проверяем права (только автор оценки может удалять)
      if (rating.raterUserId !== raterUserId) {
        throw new Error('You can only delete your own ratings');
      }

      // Удаляем оценку
      const success = await repositories.readerQualityRatings.deleteRating(ratingId);

      if (success) {
        logger.info(`Rating deleted: ${ratingId}`);
      }

      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error deleting rating');
      throw error;
    }
  }

  /**
   * Получить оценку по ID
   */
  async getRating(ratingId: string) {
    try {
      return await repositories.readerQualityRatings.getRating(ratingId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting rating');
      throw error;
    }
  }

  /**
   * Получить оценки чтеца
   */
  async getReaderRatings(ratedUserId: string, limit?: number) {
    try {
      let ratings = await repositories.readerQualityRatings.getReaderRatings(ratedUserId);

      if (limit) {
        ratings = ratings.slice(0, limit);
      }

      return ratings;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting reader ratings');
      throw error;
    }
  }

  /**
   * Получить оценки чтеца по клубу
   */
  async getReaderRatingsInClub(ratedUserId: string, clubId: string) {
    try {
      return await repositories.readerQualityRatings.getReaderRatingsInClub(ratedUserId, clubId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting reader ratings in club');
      throw error;
    }
  }

  /**
   * Получить оценки по клубу
   */
  async getClubRatings(clubId: string) {
    try {
      return await repositories.readerQualityRatings.getRatingsByClub(clubId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting club ratings');
      throw error;
    }
  }

  /**
   * Получить статистику качества чтеца
   */
  async getReaderQualityStats(ratedUserId: string): Promise<ReaderQualityStats> {
    try {
      const ratings = await repositories.readerQualityRatings.getReaderRatings(ratedUserId);

      if (ratings.length === 0) {
        return {
          overall: 0,
          voiceQuality: 0,
          readingPace: 0,
          articulation: 0,
          emotion: 0,
          totalRatings: 0,
          recentRatings: 0,
        };
      }

      // Рассчитываем средние значения
      const sum = ratings.reduce(
        (acc, r) => ({
          overallRating: acc.overallRating + r.overallRating,
          voiceQuality: acc.voiceQuality + (r.voiceQuality || 0),
          readingPace: acc.readingPace + (r.readingPace || 0),
          articulation: acc.articulation + (r.articulation || 0),
          emotion: acc.emotion + (r.emotion || 0),
        }),
        { overallRating: 0, voiceQuality: 0, readingPace: 0, articulation: 0, emotion: 0 }
      );

      // Количество оценок за последние 30 дней
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentRatings = ratings.filter(r => r.createdAt >= thirtyDaysAgo).length;

      // Количество оценок с голосом
      const ratingsWithVoice = ratings.filter(r => r.voiceQuality !== null).length;
      const ratingsWithPace = ratings.filter(r => r.readingPace !== null).length;
      const ratingsWithArticulation = ratings.filter(r => r.articulation !== null).length;
      const ratingsWithEmotion = ratings.filter(r => r.emotion !== null).length;

      return {
        overall: sum.overallRating / ratings.length,
        voiceQuality: ratingsWithVoice > 0 ? sum.voiceQuality / ratingsWithVoice : 0,
        readingPace: ratingsWithPace > 0 ? sum.readingPace / ratingsWithPace : 0,
        articulation: ratingsWithArticulation > 0 ? sum.articulation / ratingsWithArticulation : 0,
        emotion: ratingsWithEmotion > 0 ? sum.emotion / ratingsWithEmotion : 0,
        totalRatings: ratings.length,
        recentRatings,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting reader quality stats');
      throw error;
    }
  }

  /**
   * Получить топ чтецов по рейтингу
   */
  async getTopReadersByRating(limit: number = 10, minRatings: number = 5): Promise<Array<{
    userId: string;
    username: string;
    stats: ReaderQualityStats;
  }>> {
    try {
      const users = await repositories.users.getAllUsers(false);
      const readerStats: Array<{
        userId: string;
        username: string;
        stats: ReaderQualityStats;
      }> = [];

      for (const user of users) {
        const stats = await this.getReaderQualityStats(user.id);
        if (stats.totalRatings >= minRatings) {
          readerStats.push({
            userId: user.id,
            username: user.username || 'Unknown',
            stats,
          });
        }
      }

      // Сортируем по общему рейтингу
      readerStats.sort((a, b) => b.stats.overall - a.stats.overall);

      return readerStats.slice(0, limit);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error getting top readers by rating');
      throw error;
    }
  }

  /**
   * Проверить, может ли пользователь оценить чтеца
   */
  async canRateReader(
    raterUserId: string,
    ratedUserId: string,
    clubId: string,
    sessionId: string
  ): Promise<{ canRate: boolean; reason?: string }> {
    try {
      // Проверяем, что пользователь не оценивает сам себя
      if (raterUserId === ratedUserId) {
        return { canRate: false, reason: 'Cannot rate yourself' };
      }

      // Проверяем существование сессии
      const session = await storage.getReadingSession(sessionId);
      if (!session) {
        return { canRate: false, reason: 'Session not found' };
      }

      if (session.clubId !== clubId) {
        return { canRate: false, reason: 'Session does not belong to this club' };
      }

      if (session.readerId !== ratedUserId) {
        return { canRate: false, reason: 'User was not the reader in this session' };
      }

      // Проверяем, что пользователь был слушателем
      const listeners = await repositories.reading.getSessionListeners(sessionId);
      const wasListener = listeners.some((listener) => listener.id === raterUserId);
      if (!wasListener) {
        return { canRate: false, reason: 'User was not a listener in this session' };
      }

      // Проверяем, что оценка ещё не существует
      const existingRating = await repositories.readerQualityRatings.getUserRatingForReaderInClub(
        raterUserId,
        ratedUserId,
        clubId
      );

      if (existingRating) {
        return { canRate: false, reason: 'You have already rated this reader in this club' };
      }

      return { canRate: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error checking if user can rate reader');
      throw error;
    }
  }

  /**
   * Валидация оценки (1-5)
   */
  private validateRating(value: number, fieldName: string): void {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(`${fieldName} must be an integer between 1 and 5`);
    }
  }

}

// Экспортируем singleton
export const readerQualityService = new ReaderQualityService();
