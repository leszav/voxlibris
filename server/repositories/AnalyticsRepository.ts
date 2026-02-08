import { BaseRepository } from './BaseRepository.js';
import { eq, desc } from 'drizzle-orm';
import { 
  bookAccessLogs,
  type BookAccessLog,
  type InsertBookAccessLog
} from '../../shared/schema.js';

/**
 * Репозиторий для аналитики и логирования
 * Управляет логами доступа к книгам и другими аналитическими данными
 */
export class AnalyticsRepository extends BaseRepository {
  
  /**
   * Логирование доступа к книге
   */
  async logBookAccess(log: InsertBookAccessLog & { userId: string }): Promise<BookAccessLog> {
    try {
      const insertData = log as typeof bookAccessLogs.$inferInsert;
      const result = await this.db
        .insert(bookAccessLogs)
        .values(insertData)
        .returning();

      return result[0];
    } catch (error) {
      this.logError('logBookAccess', error);
      throw new Error('Failed to log book access');
    }
  }

  /**
   * Получение логов доступа к конкретной книге
   */
  async getBookAccessLogs(bookId: string): Promise<BookAccessLog[]> {
    try {
      const result = await this.db
        .select()
        .from(bookAccessLogs)
        .where(eq(bookAccessLogs.bookId, bookId))
        .orderBy(desc(bookAccessLogs.timestamp));

      return result;
    } catch (error) {
      this.logError('getBookAccessLogs', error);
      throw new Error('Failed to get book access logs');
    }
  }

  /**
   * Получение логов доступа пользователя
   */
  async getUserAccessLogs(userId: string): Promise<BookAccessLog[]> {
    try {
      const result = await this.db
        .select()
        .from(bookAccessLogs)
        .where(eq(bookAccessLogs.userId, userId))
        .orderBy(desc(bookAccessLogs.timestamp));

      return result;
    } catch (error) {
      this.logError('getUserAccessLogs', error);
      throw new Error('Failed to get user access logs');
    }
  }
}
