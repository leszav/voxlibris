import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc } from 'drizzle-orm';
import { listenerPayments, type ListenerPayment, type InsertListenerPayment, type MonetizationType, type PaymentStatus } from '../../shared/schema.js';

/**
 * Репозиторий для платежей слушателей
 */
export class ListenerPaymentsRepository extends BaseRepository {

  /**
   * Создать платёж
   */
  async createPayment(payment: InsertListenerPayment & { userId: string; clubId: string; monetizationType: MonetizationType; status?: PaymentStatus }): Promise<ListenerPayment> {
    try {
      const result = await this.db
        .insert(listenerPayments)
        .values(payment)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('createPayment', error);
      throw new Error('Failed to create payment');
    }
  }

  /**
   * Получить платёж по ID
   */
  async getPayment(id: string): Promise<ListenerPayment | undefined> {
    try {
      const result = await this.db
        .select()
        .from(listenerPayments)
        .where(eq(listenerPayments.id, id))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getPayment', error);
      throw new Error('Failed to get payment');
    }
  }

  /**
   * Получить платежи пользователя
   */
  async getUserPayments(userId: string): Promise<ListenerPayment[]> {
    try {
      return await this.db
        .select()
        .from(listenerPayments)
        .where(eq(listenerPayments.userId, userId))
        .orderBy(desc(listenerPayments.createdAt));
    } catch (error) {
      this.logError('getUserPayments', error);
      throw new Error('Failed to get user payments');
    }
  }

  /**
   * Получить платежи пользователя по клубу
   */
  async getUserPaymentsForClub(userId: string, clubId: string): Promise<ListenerPayment[]> {
    try {
      return await this.db
        .select()
        .from(listenerPayments)
        .where(and(
          eq(listenerPayments.userId, userId),
          eq(listenerPayments.clubId, clubId)
        ))
        .orderBy(desc(listenerPayments.createdAt));
    } catch (error) {
      this.logError('getUserPaymentsForClub', error);
      throw new Error('Failed to get user payments for club');
    }
  }

  /**
   * Получить платежи по сессии
   */
  async getSessionPayments(sessionId: string): Promise<ListenerPayment[]> {
    try {
      return await this.db
        .select()
        .from(listenerPayments)
        .where(eq(listenerPayments.sessionId, sessionId));
    } catch (error) {
      this.logError('getSessionPayments', error);
      throw new Error('Failed to get session payments');
    }
  }

  /**
   * Получить платежи по статусу
   */
  async getPaymentsByStatus(status: 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled'): Promise<ListenerPayment[]> {
    try {
      return await this.db
        .select()
        .from(listenerPayments)
        .where(eq(listenerPayments.status, status))
        .orderBy(desc(listenerPayments.createdAt));
    } catch (error) {
      this.logError('getPaymentsByStatus', error);
      throw new Error('Failed to get payments by status');
    }
  }

  /**
   * Обновить статус платежа
   */
  async updatePaymentStatus(
    id: string,
    status: 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled',
    paymentIntentId?: string
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(listenerPayments)
        .set({
          status,
          paymentIntentId,
          updatedAt: new Date()
        })
        .where(eq(listenerPayments.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updatePaymentStatus', error);
      throw new Error('Failed to update payment status');
    }
  }

  /**
   * Создать возврат
   */
  async createRefund(
    id: string,
    refundId: string,
    refundAmount: number,
    refundReason: string
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(listenerPayments)
        .set({
          status: 'refunded',
          refundId,
          refundAmount,
          refundReason,
          refundedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(listenerPayments.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('createRefund', error);
      throw new Error('Failed to create refund');
    }
  }

  /**
   * Подсчитать общие платежи пользователя
   */
  async getTotalUserPayments(userId: string): Promise<{ total: number; completed: number; pending: number }> {
    try {
      const payments = await this.getUserPayments(userId);
      return {
        total: payments.length,
        completed: payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0),
        pending: payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0)
      };
    } catch (error) {
      this.logError('getTotalUserPayments', error);
      throw new Error('Failed to get total user payments');
    }
  }
}
