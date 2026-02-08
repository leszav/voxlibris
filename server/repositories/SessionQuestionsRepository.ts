import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc } from 'drizzle-orm';
import { sessionQuestions, type SessionQuestion, type InsertSessionQuestion } from '../../shared/schema.js';

/**
 * Репозиторий для вопросов к чтецу
 */
export class SessionQuestionsRepository extends BaseRepository {

  /**
   * Задать вопрос
   */
  async askQuestion(question: InsertSessionQuestion & { userId: string }): Promise<SessionQuestion> {
    try {
      const result = await this.db
        .insert(sessionQuestions)
        .values(question)
        .returning();
      return result[0];
    } catch (error) {
      this.logError('askQuestion', error);
      throw new Error('Failed to ask question');
    }
  }

  /**
   * Получить вопросы сессии
   */
  async getSessionQuestions(sessionId: string, includeAnswered: boolean = false): Promise<SessionQuestion[]> {
    try {
      const query = and(
        eq(sessionQuestions.sessionId, sessionId),
        includeAnswered ? undefined : eq(sessionQuestions.isAnswered, false)
      );

      return await this.db
        .select()
        .from(sessionQuestions)
        .where(query)
        .orderBy(desc(sessionQuestions.createdAt));
    } catch (error) {
      this.logError('getSessionQuestions', error);
      throw new Error('Failed to get session questions');
    }
  }

  /**
   * Получить вопросы пользователя
   */
  async getUserQuestions(userId: string): Promise<SessionQuestion[]> {
    try {
      return await this.db
        .select()
        .from(sessionQuestions)
        .where(eq(sessionQuestions.userId, userId))
        .orderBy(desc(sessionQuestions.createdAt));
    } catch (error) {
      this.logError('getUserQuestions', error);
      throw new Error('Failed to get user questions');
    }
  }

  /**
   * Получить вопрос по ID
   */
  async getQuestion(id: string): Promise<SessionQuestion | undefined> {
    try {
      const result = await this.db
        .select()
        .from(sessionQuestions)
        .where(eq(sessionQuestions.id, id))
        .limit(1);
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getQuestion', error);
      throw new Error('Failed to get question');
    }
  }

  /**
   * Ответить на вопрос
   */
  async answerQuestion(id: string, answer: string): Promise<SessionQuestion> {
    try {
      const result = await this.db
        .update(sessionQuestions)
        .set({
          answer,
          isAnswered: true,
          answeredAt: new Date()
        })
        .where(eq(sessionQuestions.id, id))
        .returning();
      return result[0];
    } catch (error) {
      this.logError('answerQuestion', error);
      throw new Error('Failed to answer question');
    }
  }

  /**
   * Удалить вопрос
   */
  async deleteQuestion(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(sessionQuestions)
        .where(eq(sessionQuestions.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      this.logError('deleteQuestion', error);
      throw new Error('Failed to delete question');
    }
  }

  /**
   * Подсчитать неотвеченные вопросы
   */
  async countUnansweredQuestions(sessionId: string): Promise<number> {
    try {
      const result = await this.db
        .select()
        .from(sessionQuestions)
        .where(and(
          eq(sessionQuestions.sessionId, sessionId),
          eq(sessionQuestions.isAnswered, false)
        ));
      return result.length;
    } catch (error) {
      this.logError('countUnansweredQuestions', error);
      throw new Error('Failed to count unanswered questions');
    }
  }
}
