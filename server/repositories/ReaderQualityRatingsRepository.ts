import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc } from 'drizzle-orm';
import { readerQualityRatings, type ReaderQualityRating, type InsertReaderQualityRating } from '../../shared/schema.js';

/**
 * Репозиторий для оценок качества чтения
 */
export class ReaderQualityRatingsRepository extends BaseRepository {

  /**
   * Создать оценку качества
   */
  async createRating(rating: InsertReaderQualityRating & { ratedUserId: string; raterUserId: string }): Promise<ReaderQualityRating> {
    try {
      const result = await this.db
        .insert(readerQualityRatings)
        .values(rating)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('createRating', error);
      throw new Error('Failed to create rating');
    }
  }

  /**
   * Получить оценку по ID
   */
  async getRating(id: string): Promise<ReaderQualityRating | undefined> {
    try {
      const result = await this.db
        .select()
        .from(readerQualityRatings)
        .where(eq(readerQualityRatings.id, id))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getRating', error);
      throw new Error('Failed to get rating');
    }
  }

  /**
   * Получить оценки чтеца
   */
  async getReaderRatings(ratedUserId: string): Promise<ReaderQualityRating[]> {
    try {
      return await this.db
        .select()
        .from(readerQualityRatings)
        .where(eq(readerQualityRatings.ratedUserId, ratedUserId))
        .orderBy(desc(readerQualityRatings.createdAt));
    } catch (error) {
      this.logError('getReaderRatings', error);
      throw new Error('Failed to get reader ratings');
    }
  }

  /**
   * Получить оценки по клубу
   */
  async getRatingsByClub(clubId: string): Promise<ReaderQualityRating[]> {
    try {
      return await this.db
        .select()
        .from(readerQualityRatings)
        .where(eq(readerQualityRatings.clubId, clubId))
        .orderBy(desc(readerQualityRatings.createdAt));
    } catch (error) {
      this.logError('getRatingsByClub', error);
      throw new Error('Failed to get ratings by club');
    }
  }

  /**
   * Получить оценку пользователя для чтеца в клубе
   */
  async getUserRatingForReaderInClub(
    raterUserId: string,
    ratedUserId: string,
    clubId: string
  ): Promise<ReaderQualityRating | undefined> {
    try {
      const result = await this.db
        .select()
        .from(readerQualityRatings)
        .where(and(
          eq(readerQualityRatings.raterUserId, raterUserId),
          eq(readerQualityRatings.ratedUserId, ratedUserId),
          eq(readerQualityRatings.clubId, clubId)
        ))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getUserRatingForReaderInClub', error);
      throw new Error('Failed to get user rating for reader in club');
    }
  }

  /**
   * Обновить оценку
   */
  async updateRating(
    id: string,
    updates: Partial<Pick<InsertReaderQualityRating, 'voiceQuality' | 'readingPace' | 'articulation' | 'emotion' | 'overallRating' | 'feedback'>>
  ): Promise<ReaderQualityRating> {
    try {
      const result = await this.db
        .update(readerQualityRatings)
        .set(updates)
        .where(eq(readerQualityRatings.id, id))
        .returning();
      return result[0];
    } catch (error) {
      this.logError('updateRating', error);
      throw new Error('Failed to update rating');
    }
  }

  /**
   * Удалить оценку
   */
  async deleteRating(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(readerQualityRatings)
        .where(eq(readerQualityRatings.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('deleteRating', error);
      throw new Error('Failed to delete rating');
    }
  }

  /**
   * Рассчитать средний рейтинг чтеца
   */
  async calculateAverageReaderRating(ratedUserId: string): Promise<{
    overall: number;
    voiceQuality: number;
    readingPace: number;
    articulation: number;
    emotion: number;
    totalRatings: number;
  }> {
    try {
      const ratings = await this.getReaderRatings(ratedUserId);

      if (ratings.length === 0) {
        return {
          overall: 0,
          voiceQuality: 0,
          readingPace: 0,
          articulation: 0,
          emotion: 0,
          totalRatings: 0
        };
      }

      const sum = ratings.reduce((acc, r) => ({
        overallRating: acc.overallRating + r.overallRating,
        voiceQuality: acc.voiceQuality + (r.voiceQuality || 0),
        readingPace: acc.readingPace + (r.readingPace || 0),
        articulation: acc.articulation + (r.articulation || 0),
        emotion: acc.emotion + (r.emotion || 0)
      }), { overallRating: 0, voiceQuality: 0, readingPace: 0, articulation: 0, emotion: 0 });

      return {
        overall: sum.overallRating / ratings.length,
        voiceQuality: sum.voiceQuality / ratings.length,
        readingPace: sum.readingPace / ratings.length,
        articulation: sum.articulation / ratings.length,
        emotion: sum.emotion / ratings.length,
        totalRatings: ratings.length
      };
    } catch (error) {
      this.logError('calculateAverageReaderRating', error);
      throw new Error('Failed to calculate average reader rating');
    }
  }

  /**
   * Получить оценки чтеца по клубу
   */
  async getReaderRatingsInClub(ratedUserId: string, clubId: string): Promise<ReaderQualityRating[]> {
    try {
      return await this.db
        .select()
        .from(readerQualityRatings)
        .where(and(
          eq(readerQualityRatings.ratedUserId, ratedUserId),
          eq(readerQualityRatings.clubId, clubId)
        ))
        .orderBy(desc(readerQualityRatings.createdAt));
    } catch (error) {
      this.logError('getReaderRatingsInClub', error);
      throw new Error('Failed to get reader ratings in club');
    }
  }
}
