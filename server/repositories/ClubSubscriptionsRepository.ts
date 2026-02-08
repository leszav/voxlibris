import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc } from 'drizzle-orm';
import { clubSubscriptions, type ClubSubscription, type InsertClubSubscription, type SubscriptionStatus } from '../../shared/schema.js';

/**
 * Репозиторий для подписок на клубы
 */
export class ClubSubscriptionsRepository extends BaseRepository {

  /**
   * Создать подписку
   */
  async createSubscription(subscription: InsertClubSubscription & { clubId: string; userId: string; status?: SubscriptionStatus }): Promise<ClubSubscription> {
    try {
      const result = await this.db
        .insert(clubSubscriptions)
        .values(subscription)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('createSubscription', error);
      throw new Error('Failed to create subscription');
    }
  }

  /**
   * Получить подписку по ID
   */
  async getSubscription(id: string): Promise<ClubSubscription | undefined> {
    try {
      const result = await this.db
        .select()
        .from(clubSubscriptions)
        .where(eq(clubSubscriptions.id, id))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getSubscription', error);
      throw new Error('Failed to get subscription');
    }
  }

  /**
   * Получить активную подписку пользователя на клуб
   */
  async getUserActiveSubscription(userId: string, clubId: string): Promise<ClubSubscription | undefined> {
    try {
      const result = await this.db
        .select()
        .from(clubSubscriptions)
        .where(and(
          eq(clubSubscriptions.userId, userId),
          eq(clubSubscriptions.clubId, clubId),
          eq(clubSubscriptions.status, 'active')
        ))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getUserActiveSubscription', error);
      throw new Error('Failed to get user active subscription');
    }
  }

  /**
   * Получить все подписки пользователя
   */
  async getUserSubscriptions(userId: string): Promise<ClubSubscription[]> {
    try {
      return await this.db
        .select()
        .from(clubSubscriptions)
        .where(eq(clubSubscriptions.userId, userId))
        .orderBy(desc(clubSubscriptions.createdAt));
    } catch (error) {
      this.logError('getUserSubscriptions', error);
      throw new Error('Failed to get user subscriptions');
    }
  }

  /**
   * Получить активные подписки пользователя
   */
  async getUserActiveSubscriptions(userId: string): Promise<ClubSubscription[]> {
    try {
      return await this.db
        .select()
        .from(clubSubscriptions)
        .where(and(
          eq(clubSubscriptions.userId, userId),
          eq(clubSubscriptions.status, 'active')
        ))
        .orderBy(desc(clubSubscriptions.createdAt));
    } catch (error) {
      this.logError('getUserActiveSubscriptions', error);
      throw new Error('Failed to get user active subscriptions');
    }
  }

  /**
   * Получить подписки клуба
   */
  async getClubSubscriptions(clubId: string): Promise<ClubSubscription[]> {
    try {
      return await this.db
        .select()
        .from(clubSubscriptions)
        .where(eq(clubSubscriptions.clubId, clubId))
        .orderBy(desc(clubSubscriptions.createdAt));
    } catch (error) {
      this.logError('getClubSubscriptions', error);
      throw new Error('Failed to get club subscriptions');
    }
  }

  /**
   * Обновить статус подписки
   */
  async updateSubscriptionStatus(
    id: string,
    status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing'
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubSubscriptions)
        .set({
          status,
          canceledAt: status === 'canceled' ? new Date() : undefined,
          updatedAt: new Date()
        })
        .where(eq(clubSubscriptions.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateSubscriptionStatus', error);
      throw new Error('Failed to update subscription status');
    }
  }

  /**
   * Обновить период подписки
   */
  async updateSubscriptionPeriod(
    id: string,
    currentPeriodStart: Date,
    currentPeriodEnd: Date
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubSubscriptions)
        .set({
          currentPeriodStart,
          currentPeriodEnd,
          updatedAt: new Date()
        })
        .where(eq(clubSubscriptions.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('updateSubscriptionPeriod', error);
      throw new Error('Failed to update subscription period');
    }
  }

  /**
   * Отменить подписку в конце периода
   */
  async cancelSubscriptionAtPeriodEnd(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubSubscriptions)
        .set({
          cancelAtPeriodEnd: true,
          updatedAt: new Date()
        })
        .where(eq(clubSubscriptions.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('cancelSubscriptionAtPeriodEnd', error);
      throw new Error('Failed to cancel subscription at period end');
    }
  }

  /**
   * Удалить подписку
   */
  async deleteSubscription(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(clubSubscriptions)
        .where(eq(clubSubscriptions.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('deleteSubscription', error);
      throw new Error('Failed to delete subscription');
    }
  }

  /**
   * Подсчитать активные подписки клуба
   */
  async countActiveSubscriptions(clubId: string): Promise<number> {
    try {
      const result = await this.db
        .select()
        .from(clubSubscriptions)
        .where(and(
          eq(clubSubscriptions.clubId, clubId),
          eq(clubSubscriptions.status, 'active')
        ));
      return result.length;
    } catch (error) {
      this.logError('countActiveSubscriptions', error);
      throw new Error('Failed to count active subscriptions');
    }
  }
}
