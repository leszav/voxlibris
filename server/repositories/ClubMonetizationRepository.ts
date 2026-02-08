import { BaseRepository } from './BaseRepository.js';
import { eq, and } from 'drizzle-orm';
import { clubMonetization, type ClubMonetization, type InsertClubMonetization, type MonetizationType } from '../../shared/schema.js';

/**
 * Репозиторий для настроек монетизации клубов
 */
export class ClubMonetizationRepository extends BaseRepository {

  /**
   * Создать настройку монетизации
   */
  async createMonetization(monetization: InsertClubMonetization & { clubId: string; type: MonetizationType }): Promise<ClubMonetization> {
    try {
      const result = await this.db
        .insert(clubMonetization)
        .values(monetization)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('createMonetization', error);
      throw new Error('Failed to create monetization');
    }
  }

  /**
   * Получить монетизацию клуба
   */
  async getClubMonetization(clubId: string): Promise<ClubMonetization | undefined> {
    try {
      const result = await this.db
        .select()
        .from(clubMonetization)
        .where(eq(clubMonetization.clubId, clubId))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getClubMonetization', error);
      throw new Error('Failed to get club monetization');
    }
  }

  /**
   * Получить активную монетизацию клуба
   */
  async getActiveClubMonetization(clubId: string): Promise<ClubMonetization | undefined> {
    try {
      const result = await this.db
        .select()
        .from(clubMonetization)
        .where(and(
          eq(clubMonetization.clubId, clubId),
          eq(clubMonetization.isActive, true)
        ))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getActiveClubMonetization', error);
      throw new Error('Failed to get active club monetization');
    }
  }

  /**
   * Обновить монетизацию
   */
  async updateMonetization(
    id: string,
    updates: Partial<Omit<InsertClubMonetization, 'clubId' | 'type'>>
  ): Promise<ClubMonetization> {
    try {
      const result = await this.db
        .update(clubMonetization)
        .set(updates)
        .where(eq(clubMonetization.id, id))
        .returning();
      return result[0];
    } catch (error) {
      this.logError('updateMonetization', error);
      throw new Error('Failed to update monetization');
    }
  }

  /**
   * Активировать монетизацию
   */
  async activateMonetization(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubMonetization)
        .set({
          isActive: true,
          updatedAt: new Date()
        })
        .where(eq(clubMonetization.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('activateMonetization', error);
      throw new Error('Failed to activate monetization');
    }
  }

  /**
   * Деактивировать монетизацию
   */
  async deactivateMonetization(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubMonetization)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(eq(clubMonetization.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('deactivateMonetization', error);
      throw new Error('Failed to deactivate monetization');
    }
  }

  /**
   * Удалить монетизацию
   */
  async deleteMonetization(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(clubMonetization)
        .where(eq(clubMonetization.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('deleteMonetization', error);
      throw new Error('Failed to delete monetization');
    }
  }
}
