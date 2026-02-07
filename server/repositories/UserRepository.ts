import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc } from 'drizzle-orm';
import { users, refreshTokens } from '../../shared/schema.js';
import type {
  User,
  InsertUser,
  UserRole,
  UserStatus,
  RefreshToken
} from '../../shared/schema.js';

/**
 * User Domain Repository - единственная ответственность: управление пользователями
 * Изолирует всю логику работы с пользователями от других доменов
 * Соблюдает принцип DRY через наследование от BaseRepository
 */
export class UserRepository extends BaseRepository {
  
  /**
   * Получение пользователя по ID с безопасной валидацией
   */
  async getUser(id: string): Promise<User | undefined> {
    this.validateRequired(id, 'id');
    
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getUser', error);
      return undefined;
    }
  }

  /**
   * Поиск пользователя по username
   */
  async getUserByUsername(username: string): Promise<User | undefined> {
    this.validateRequired(username, 'username');
    
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getUserByUsername', error);
      return undefined;
    }
  }

  /**
   * Поиск пользователя по email
   */
  async getUserByEmail(email: string): Promise<User | undefined> {
    this.validateRequired(email, 'email');
    
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getUserByEmail', error);
      return undefined;
    }
  }

  /**
   * Создание пользователя с транзакционной безопасностью
   */
  async createUser(insertUser: InsertUser): Promise<User> {
    this.validateRequired(insertUser.username, 'username');
    this.validateRequired(insertUser.email, 'email');
    this.validateRequired(insertUser.password, 'password');
    
    try {
      const result = await this.db
        .insert(users)
        .values(insertUser)
        .returning();
      
      const newUser = this.getFirstResult(result);
      if (!newUser) {
        throw new Error('CRITICAL: User creation failed - no result returned');
      }
      
      return newUser;
    } catch (error) {
      this.logError('createUser', error);
      throw error;
    }
  }

  /**
   * Обновление роли пользователя
   */
  async updateUserRole(username: string, role: UserRole): Promise<User | undefined> {
    this.validateRequired(username, 'username');
    this.validateRequired(role, 'role');
    
    try {
      const result = await this.db
        .update(users)
        .set({ role })
        .where(eq(users.username, username))
        .returning();
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateUserRole', error);
      return undefined;
    }
  }

  /**
   * Обновление статуса пользователя
   */
  async updateUserStatus(username: string, status: UserStatus): Promise<User | undefined> {
    this.validateRequired(username, 'username');
    this.validateRequired(status, 'status');
    
    try {
      const result = await this.db
        .update(users)
        .set({ status })
        .where(eq(users.username, username))
        .returning();
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateUserStatus', error);
      return undefined;
    }
  }

  /**
   * Обновление времени последней активности
   */
  async updateUserLastActivity(userId: string): Promise<User | undefined> {
    this.validateRequired(userId, 'userId');
    
    try {
      const result = await this.db
        .update(users)
        .set({ lastActivityAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateUserLastActivity', error);
      return undefined;
    }
  }

  /**
   * Email Confirmation Methods - часть user domain
   */
  async getUserByConfirmationToken(token: string): Promise<User | undefined> {
    this.validateRequired(token, 'token');
    
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.confirmationToken, token))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getUserByConfirmationToken', error);
      return undefined;
    }
  }

  async updateUserEmailConfirmation(userId: string, confirmed: boolean): Promise<User | undefined> {
    this.validateRequired(userId, 'userId');
    
    try {
      const result = await this.db
        .update(users)
        .set({ emailConfirmed: confirmed })
        .where(eq(users.id, userId))
        .returning();
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateUserEmailConfirmation', error);
      return undefined;
    }
  }

  async updateUserConfirmationToken(userId: string, token: string): Promise<User | undefined> {
    this.validateRequired(userId, 'userId');
    this.validateRequired(token, 'token');
    
    try {
      const result = await this.db
        .update(users)
        .set({ confirmationToken: token })
        .where(eq(users.id, userId))
        .returning();
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateUserConfirmationToken', error);
      return undefined;
    }
  }

  /**
   * Refresh Token Methods - тесно связаны с User domain
   */
  async createRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
    this.validateRequired(userId, 'userId');
    this.validateRequired(token, 'token');
    this.validateRequired(expiresAt, 'expiresAt');
    
    try {
      const result = await this.db
        .insert(refreshTokens)
        .values({ userId, token, expiresAt })
        .returning();
      
      const newToken = this.getFirstResult(result);
      if (!newToken) {
        throw new Error('CRITICAL: RefreshToken creation failed');
      }
      
      return newToken;
    } catch (error) {
      this.logError('createRefreshToken', error);
      throw error;
    }
  }

  async getRefreshToken(token: string): Promise<RefreshToken | undefined> {
    this.validateRequired(token, 'token');
    
    try {
      const result = await this.db
        .select()
        .from(refreshTokens)
        .where(and(
          eq(refreshTokens.token, token),
          eq(refreshTokens.isRevoked, false)
        ))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getRefreshToken', error);
      return undefined;
    }
  }

  async revokeRefreshToken(token: string): Promise<boolean> {
    this.validateRequired(token, 'token');
    
    try {
      const result = await this.db
        .update(refreshTokens)
        .set({ isRevoked: true })
        .where(eq(refreshTokens.token, token))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      this.logError('revokeRefreshToken', error);
      return false;
    }
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<boolean> {
    this.validateRequired(userId, 'userId');
    
    try {
      await this.db
        .update(refreshTokens)
        .set({ isRevoked: true })
        .where(eq(refreshTokens.userId, userId));
      
      return true;
    } catch (error) {
      this.logError('revokeAllUserRefreshTokens', error);
      return false;
    }
  }

  async cleanExpiredRefreshTokens(): Promise<void> {
    try {
      const { lt } = await import('drizzle-orm');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      await this.db
        .delete(refreshTokens)
        .where(and(
          eq(refreshTokens.isRevoked, true),
          lt(refreshTokens.createdAt, thirtyDaysAgo)
        ));
    } catch (error) {
      this.logError('cleanExpiredRefreshTokens', error);
    }
  }

  /**
   * User Management Methods - расширенное управление пользователями
   */

  /**
   * Мягкое удаление пользователя (меняем статус на 'deleted')
   */
  async deleteUser(userId: string): Promise<boolean> {
    this.validateRequired(userId, 'userId');
    
    try {
      const result = await this.db
        .update(users)
        .set({ status: 'deleted' as UserStatus })
        .where(eq(users.id, userId))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      this.logError('deleteUser', error);
      return false;
    }
  }

  /**
   * Восстановление удаленного пользователя
   */
  async restoreUser(userId: string): Promise<User | undefined> {
    this.validateRequired(userId, 'userId');
    
    try {
      const result = await this.db
        .update(users)
        .set({ status: 'active' as UserStatus })
        .where(eq(users.id, userId))
        .returning();
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('restoreUser', error);
      return undefined;
    }
  }

  /**
   * Полное удаление пользователя из БД
   * Проверяет отсутствие клубов с активными участниками
   */
  async permanentDeleteUser(userId: string): Promise<{ 
    success: boolean; 
    error?: string; 
    clubsWithMembers?: Array<{ id: string; title: string; memberCount: number }> 
  }> {
    this.validateRequired(userId, 'userId');
    
    // Импортируем необходимые таблицы и функции для проверки
    const { clubs, clubMembers, userProfiles } = await import('../../shared/schema.js');
    const { count, ne } = await import('drizzle-orm');
    
    try {
      await this.db.transaction(async (tx) => {
        // Удаляем профиль пользователя
        await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));

        // Проверяем клубы в собственности
        const ownedClubs = await tx
          .select()
          .from(clubs)
          .where(and(eq(clubs.ownerId, userId), eq(clubs.isActive, true)));

        const clubsWithMembers: Array<{ id: string; title: string; memberCount: number }> = [];

        for (const club of ownedClubs) {
          const memberCountResult = await tx
            .select({ count: count(clubMembers.id) })
            .from(clubMembers)
            .where(and(
              eq(clubMembers.clubId, club.id),
              eq(clubMembers.isActive, true),
              ne(clubMembers.userId, userId)
            ));

          const memberCount = Number(memberCountResult[0]?.count || 0);

          if (memberCount > 0) {
            clubsWithMembers.push({
              id: club.id,
              title: club.title,
              memberCount
            });
          } else {
            // Удаляем пустые клубы
            await tx.delete(clubs).where(eq(clubs.id, club.id));
          }
        }

        if (clubsWithMembers.length > 0) {
          throw new Error('CLUBS_WITH_MEMBERS');
        }

        // Удаляем пользователя
        const result = await tx
          .delete(users)
          .where(eq(users.id, userId))
          .returning();

        if (result.length === 0) {
          throw new Error('USER_NOT_FOUND');
        }
      });

      return { success: true };
    } catch (error: any) {
      const { clubs, clubMembers } = await import('../../shared/schema.js');
      const { count, ne } = await import('drizzle-orm');
      
      if (error.message === 'CLUBS_WITH_MEMBERS') {
        // Получаем информацию о клубах с участниками
        const ownedClubs = await this.db
          .select({
            id: clubs.id,
            title: clubs.title
          })
          .from(clubs)
          .where(and(eq(clubs.ownerId, userId), eq(clubs.isActive, true)));

        const clubsWithMembers = await Promise.all(
          ownedClubs.map(async (club) => {
            const memberCountResult = await this.db
              .select({ count: count(clubMembers.id) })
              .from(clubMembers)
              .where(and(
                eq(clubMembers.clubId, club.id),
                eq(clubMembers.isActive, true),
                ne(clubMembers.userId, userId)
              ));

            return {
              id: club.id,
              title: club.title,
              memberCount: Number(memberCountResult[0]?.count || 0)
            };
          })
        );

        return { 
          success: false, 
          error: 'Cannot delete user: owns clubs with active members',
          clubsWithMembers: clubsWithMembers.filter(c => c.memberCount > 0)
        };
      }
      
      this.logError('permanentDeleteUser', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Получение всех пользователей (с опцией включения удаленных)
   */
  async getAllUsers(includeDeleted: boolean = false): Promise<User[]> {
    try {
      const { sql } = await import('drizzle-orm');
      
      const query = this.db.select().from(users);

      if (!includeDeleted) {
        const result = await query
          .where(sql`${users.status} != 'deleted'`)
          .orderBy(desc(users.createdAt));
        return result;
      }

      const result = await query.orderBy(desc(users.createdAt));
      return result;
    } catch (error) {
      this.logError('getAllUsers', error);
      return [];
    }
  }

  /**
   * Получение только удаленных пользователей
   */
  async getDeletedUsers(): Promise<User[]> {
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.status, 'deleted'))
        .orderBy(desc(users.createdAt));

      return result;
    } catch (error) {
      this.logError('getDeletedUsers', error);
      return [];
    }
  }

  /**
   * Получение пользователей на модерации
   */
  async getPendingUsers(): Promise<User[]> {
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.status, 'pending'))
        .orderBy(desc(users.createdAt));

      return result;
    } catch (error) {
      this.logError('getPendingUsers', error);
      return [];
    }
  }
}
