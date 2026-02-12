import { BaseRepository } from './BaseRepository.js';
import { eq, desc } from 'drizzle-orm';
import { clubDiscussions, users } from '../../shared/schema.js';
import type { ClubDiscussion, InsertClubDiscussion } from '../../shared/schema.js';

export interface ClubDiscussionWithUser extends ClubDiscussion {
  user: {
    id: string;
    username: string;
    email: string;
  };
  replies?: ClubDiscussionWithUser[];
}

/**
 * Club Discussions Repository - управление доской обсуждений клуба
 */
export class ClubDiscussionsRepository extends BaseRepository {
  
  /**
   * Получить все обсуждения клуба (последние 500 сообщений)
   * Возвращает сообщения с информацией об авторах и вложенными ответами
   */
  async getClubDiscussions(clubId: string): Promise<ClubDiscussionWithUser[]> {
    this.validateRequired(clubId, 'clubId');
    
    try {
      // Получаем все сообщения клуба (ограничение 500)
      const allMessages = await this.db
        .select({
          id: clubDiscussions.id,
          clubId: clubDiscussions.clubId,
          userId: clubDiscussions.userId,
          content: clubDiscussions.content,
          parentId: clubDiscussions.parentId,
          quotedContent: clubDiscussions.quotedContent,
          isWarning: clubDiscussions.isWarning,
          createdAt: clubDiscussions.createdAt,
          updatedAt: clubDiscussions.updatedAt,
          username: users.username,
          userEmail: users.email,
        })
        .from(clubDiscussions)
        .innerJoin(users, eq(clubDiscussions.userId, users.id))
        .where(eq(clubDiscussions.clubId, clubId))
        .orderBy(desc(clubDiscussions.createdAt))
        .limit(500);

      // Если больше 500 сообщений, удаляем старые
      const totalCount = await this.db
        .select({ count: clubDiscussions.id })
        .from(clubDiscussions)
        .where(eq(clubDiscussions.clubId, clubId));
      
      if (totalCount.length > 0) {
        const count = totalCount.length;
        if (count > 500) {
          // Получаем ID старых сообщений для удаления
          const oldMessages = await this.db
            .select({ id: clubDiscussions.id })
            .from(clubDiscussions)
            .where(eq(clubDiscussions.clubId, clubId))
            .orderBy(clubDiscussions.createdAt)
            .limit(count - 500);
          
          // Удаляем старые сообщения
          for (const msg of oldMessages) {
            await this.db
              .delete(clubDiscussions)
              .where(eq(clubDiscussions.id, msg.id));
          }
        }
      }

      // Группируем сообщения: основные и ответы
      const mainMessages = allMessages.filter(msg => !msg.parentId);
      const replies = allMessages.filter(msg => msg.parentId);

      // Формируем дерево сообщений с ответами
      const messagesWithReplies: ClubDiscussionWithUser[] = mainMessages.map(msg => ({
        id: msg.id,
        clubId: msg.clubId,
        userId: msg.userId,
        content: msg.content,
        parentId: msg.parentId,
        quotedContent: msg.quotedContent,
        isWarning: msg.isWarning,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        user: {
          id: msg.userId,
          username: msg.username,
          email: msg.userEmail,
        },
        replies: replies
          .filter(reply => reply.parentId === msg.id)
          .map(reply => ({
            id: reply.id,
            clubId: reply.clubId,
            userId: reply.userId,
            content: reply.content,
            parentId: reply.parentId,
            quotedContent: reply.quotedContent,
            isWarning: reply.isWarning,
            createdAt: reply.createdAt,
            updatedAt: reply.updatedAt,
            user: {
              id: reply.userId,
              username: reply.username,
              email: reply.userEmail,
            },
          }))
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      }));

      // Сортируем основные сообщения от старых к новым
      return messagesWithReplies.reverse();
    } catch (error) {
      this.logError('getClubDiscussions', error);
      return [];
    }
  }

  /**
   * Создать новое сообщение или ответ на доске обсуждений
   */
  async createClubDiscussion(discussion: InsertClubDiscussion & { userId: string }): Promise<ClubDiscussionWithUser> {
    this.validateRequired(discussion.clubId, 'clubId');
    this.validateRequired(discussion.userId, 'userId');
    this.validateRequired(discussion.content, 'content');
    
    try {
      const result = await this.db
        .insert(clubDiscussions)
        .values({
          ...discussion,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      
      const newDiscussion = this.getFirstResult(result);
      if (!newDiscussion) {
        throw new Error('CRITICAL: Discussion creation failed');
      }

      // Получаем информацию о пользователе
      const user = await this.db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, discussion.userId))
        .limit(1);

      const userData = this.getFirstResult(user);
      if (!userData) {
        throw new Error('User not found');
      }

      return {
        ...newDiscussion,
        user: userData,
      };
    } catch (error) {
      this.logError('createClubDiscussion', error);
      throw error;
    }
  }

  /**
   * Удалить сообщение обсуждения (каскадно удаляет ответы)
   */
  async deleteClubDiscussion(discussionId: string): Promise<boolean> {
    this.validateRequired(discussionId, 'discussionId');
    
    try {
      const result = await this.db
        .delete(clubDiscussions)
        .where(eq(clubDiscussions.id, discussionId))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      this.logError('deleteClubDiscussion', error);
      return false;
    }
  }
}
