import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc } from 'drizzle-orm';
import { sessionReactions, type SessionReaction, type InsertSessionReaction, type ReactionType } from '../../shared/schema.js';

/**
 * Репозиторий для реакций на сессии чтения
 */
export class SessionReactionsRepository extends BaseRepository {

  /**
   * Добавить реакцию
   */
  async addReaction(reaction: InsertSessionReaction & { userId: string; type?: ReactionType }): Promise<SessionReaction> {
    try {
      const result = await this.db
        .insert(sessionReactions)
        .values(reaction)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('addReaction', error);
      throw new Error('Failed to add reaction');
    }
  }

  /**
   * Получить реакции сессии
   */
  async getSessionReactions(sessionId: string): Promise<SessionReaction[]> {
    try {
      return await this.db
        .select()
        .from(sessionReactions)
        .where(eq(sessionReactions.sessionId, sessionId))
        .orderBy(desc(sessionReactions.createdAt));
    } catch (error) {
      this.logError('getSessionReactions', error);
      throw new Error('Failed to get session reactions');
    }
  }

  /**
   * Получить реакции пользователя
   */
  async getUserReactions(userId: string): Promise<SessionReaction[]> {
    try {
      return await this.db
        .select()
        .from(sessionReactions)
        .where(eq(sessionReactions.userId, userId))
        .orderBy(desc(sessionReactions.createdAt));
    } catch (error) {
      this.logError('getUserReactions', error);
      throw new Error('Failed to get user reactions');
    }
  }

  /**
   * Получить реакции по типу
   */
  async getReactionsByType(sessionId: string, type: 'positive' | 'negative'): Promise<SessionReaction[]> {
    try {
      return await this.db
        .select()
        .from(sessionReactions)
        .where(and(
          eq(sessionReactions.sessionId, sessionId),
          eq(sessionReactions.type, type)
        ))
        .orderBy(desc(sessionReactions.createdAt));
    } catch (error) {
      this.logError('getReactionsByType', error);
      throw new Error('Failed to get reactions by type');
    }
  }

  /**
   * Удалить реакцию
   */
  async deleteReaction(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(sessionReactions)
        .where(eq(sessionReactions.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('deleteReaction', error);
      throw new Error('Failed to delete reaction');
    }
  }

  /**
   * Подсчитать реакции сессии по типам
   */
  async countReactionsByType(sessionId: string): Promise<{ positive: number; negative: number }> {
    try {
      const reactions = await this.getSessionReactions(sessionId);
      return {
        positive: reactions.filter(r => r.type === 'positive').length,
        negative: reactions.filter(r => r.type === 'negative').length
      };
    } catch (error) {
      this.logError('countReactionsByType', error);
      throw new Error('Failed to count reactions by type');
    }
  }
}
