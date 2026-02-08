import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc } from 'drizzle-orm';
import { readerEarnings, type ReaderEarning, type InsertReaderEarning, type MonetizationType, type EarningStatus } from '../../shared/schema.js';

/**
 * Репозиторий для доходов чтецов
 */
export class ReaderEarningsRepository extends BaseRepository {

  /**
   * Создать запись о доходе
   */
  async createEarning(earning: InsertReaderEarning & { sessionId: string; readerId: string; clubId: string; monetizationType: MonetizationType; status?: EarningStatus }): Promise<ReaderEarning> {
    try {
      const result = await this.db
        .insert(readerEarnings)
        .values(earning)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('createEarning', error);
      throw new Error('Failed to create earning');
    }
  }

  /**
   * Получить доход по ID
   */
  async getEarning(id: string): Promise<ReaderEarning | undefined> {
    try {
      const result = await this.db
        .select()
        .from(readerEarnings)
        .where(eq(readerEarnings.id, id))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getEarning', error);
      throw new Error('Failed to get earning');
    }
  }

  /**
   * Получить доходы чтеца
   */
  async getReaderEarnings(readerId: string): Promise<ReaderEarning[]> {
    try {
      return await this.db
        .select()
        .from(readerEarnings)
        .where(eq(readerEarnings.readerId, readerId))
        .orderBy(desc(readerEarnings.createdAt));
    } catch (error) {
      this.logError('getReaderEarnings', error);
      throw new Error('Failed to get reader earnings');
    }
  }

  /**
   * Получить доходы чтеца по статусу
   */
  async getReaderEarningsByStatus(readerId: string, status: 'pending' | 'processing' | 'paid' | 'failed'): Promise<ReaderEarning[]> {
    try {
      return await this.db
        .select()
        .from(readerEarnings)
        .where(and(
          eq(readerEarnings.readerId, readerId),
          eq(readerEarnings.status, status)
        ))
        .orderBy(desc(readerEarnings.createdAt));
    } catch (error) {
      this.logError('getReaderEarningsByStatus', error);
      throw new Error('Failed to get reader earnings by status');
    }
  }

  /**
   * Получить доходы по сессии
   */
  async getSessionEarnings(sessionId: string): Promise<ReaderEarning[]> {
    try {
      return await this.db
        .select()
        .from(readerEarnings)
        .where(eq(readerEarnings.sessionId, sessionId));
    } catch (error) {
      this.logError('getSessionEarnings', error);
      throw new Error('Failed to get session earnings');
    }
  }

  /**
   * Обновить статус дохода
   */
  async updateEarningStatus(
    id: string,
    status: 'pending' | 'processing' | 'paid' | 'failed'
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(readerEarnings)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(eq(readerEarnings.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateEarningStatus', error);
      throw new Error('Failed to update earning status');
    }
  }

  /**
   * Обновить информацию о выплате
   */
  async updatePayoutInfo(
    id: string,
    payoutId: string,
    payoutStatus: 'pending' | 'completed' | 'failed'
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(readerEarnings)
        .set({
          payoutId,
          payoutStatus,
          payoutAt: payoutStatus === 'completed' ? new Date() : undefined,
          updatedAt: new Date()
        })
        .where(eq(readerEarnings.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updatePayoutInfo', error);
      throw new Error('Failed to update payout info');
    }
  }

  /**
   * Подсчитать общий доход чтеца
   */
  async getTotalReaderEarnings(readerId: string): Promise<{ total: number; paid: number; pending: number }> {
    try {
      const earnings = await this.getReaderEarnings(readerId);
      return {
        total: earnings.reduce((sum, e) => sum + e.netAmount, 0),
        paid: earnings.filter(e => e.status === 'paid').reduce((sum, e) => sum + e.netAmount, 0),
        pending: earnings.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.netAmount, 0)
      };
    } catch (error) {
      this.logError('getTotalReaderEarnings', error);
      throw new Error('Failed to get total reader earnings');
    }
  }
}
