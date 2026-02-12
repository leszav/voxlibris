import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc, asc, count, isNull } from 'drizzle-orm';
import { 
  readingSessions,
  sessionListeners,
  readingProgress,
  readingHistory,
  readerRatings,
  userProfiles,
  users,
  books,
  clubs,
  bookReadingStatus,
  personalBooks,
  clubBooks,
  type ReadingSession,
  type ReadingSessionWithDetails,
  type InsertReadingSession,
  type SessionListener,
  type ReadingProgress,
  type InsertReadingProgress,
  type ReadingHistory,
  type ReaderRating,
  type InsertReaderRating,
  type UserProfile,
  type InsertUserProfile,
  type User
} from '../../shared/schema.js';

/**
 * Репозиторий для функциональности чтения
 * Управляет сессиями чтения, прогрессом, историей и рейтингами читателей
 */
export class ReadingRepository extends BaseRepository {
  
  // ============================================================
  // Reading Sessions - Сессии чтения
  // ============================================================

  /**
   * Создание новой сессии чтения
   */
  async createReadingSession(session: InsertReadingSession & { readerId: string }): Promise<ReadingSession> {
    try {
      const result = await this.db
        .insert(readingSessions)
        .values(session)
        .returning();

      return result[0];
    } catch (error) {
      this.logError('createReadingSession', error);
      throw new Error('Failed to create reading session');
    }
  }

  /**
   * Получение сессии чтения с деталями
   */
  async getReadingSession(id: string): Promise<ReadingSessionWithDetails | undefined> {
    try {
      const result = await this.db
        .select({
          session: readingSessions,
          reader: {
            id: users.id,
            username: users.username,
            role: users.role,
            createdAt: users.createdAt,
          },
          book: books,
          club: clubs,
          listenerCount: count(sessionListeners.id),
        })
        .from(readingSessions)
        .leftJoin(users, eq(readingSessions.readerId, users.id))
        .leftJoin(books, eq(readingSessions.bookId, books.id))
        .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
        .leftJoin(sessionListeners, and(
          eq(sessionListeners.sessionId, readingSessions.id),
          eq(sessionListeners.isActive, true)
        ))
        .where(eq(readingSessions.id, id))
        .groupBy(readingSessions.id, users.id, books.id, clubs.id)
        .limit(1);

      if (result.length === 0) return undefined;

      const row = result[0];
      return {
        ...row.session,
        reader: row.reader!,
        book: row.book!,
        club: row.club!,
        listenerCount: Number(row.listenerCount),
      } as ReadingSessionWithDetails;
    } catch (error) {
      this.logError('getReadingSession', error);
      throw new Error('Failed to get reading session');
    }
  }

  /**
   * Получение активных сессий в клубе
   */
  async getActiveSessionsInClub(clubId: string): Promise<ReadingSessionWithDetails[]> {
    try {
      const result = await this.db
        .select({
          session: readingSessions,
          reader: {
            id: users.id,
            username: users.username,
            role: users.role,
            createdAt: users.createdAt,
          },
          book: books,
          club: clubs,
          listenerCount: count(sessionListeners.id),
        })
        .from(readingSessions)
        .leftJoin(users, eq(readingSessions.readerId, users.id))
        .leftJoin(books, eq(readingSessions.bookId, books.id))
        .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
        .leftJoin(sessionListeners, and(
          eq(sessionListeners.sessionId, readingSessions.id),
          eq(sessionListeners.isActive, true)
        ))
        .where(and(
          eq(readingSessions.clubId, clubId),
          eq(readingSessions.isLive, true)
        ))
        .groupBy(readingSessions.id, users.id, books.id, clubs.id)
        .orderBy(desc(readingSessions.startedAt));

      return result.map(row => ({
        ...row.session,
        reader: row.reader!,
        book: row.book!,
        club: row.club!,
        listenerCount: Number(row.listenerCount),
      })) as ReadingSessionWithDetails[];
    } catch (error) {
      this.logError('getActiveSessionsInClub', error);
      throw new Error('Failed to get active sessions in club');
    }
  }

  /**
   * Получение всех сессий в клубе
   */
  async getSessionsByClub(clubId: string): Promise<ReadingSessionWithDetails[]> {
    try {
      const result = await this.db
        .select({
          session: readingSessions,
          reader: {
            id: users.id,
            username: users.username,
            role: users.role,
            createdAt: users.createdAt,
          },
          book: books,
          club: clubs,
          listenerCount: count(sessionListeners.id),
        })
        .from(readingSessions)
        .leftJoin(users, eq(readingSessions.readerId, users.id))
        .leftJoin(books, eq(readingSessions.bookId, books.id))
        .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
        .leftJoin(sessionListeners, and(
          eq(sessionListeners.sessionId, readingSessions.id),
          eq(sessionListeners.isActive, true)
        ))
        .where(eq(readingSessions.clubId, clubId))
        .groupBy(readingSessions.id, users.id, books.id, clubs.id)
        .orderBy(desc(readingSessions.startedAt));

      return result.map(row => ({
        ...row.session,
        reader: row.reader!,
        book: row.book!,
        club: row.club!,
        listenerCount: Number(row.listenerCount),
      })) as ReadingSessionWithDetails[];
    } catch (error) {
      this.logError('getSessionsByClub', error);
      throw new Error('Failed to get sessions by club');
    }
  }

  /**
   * Получение сессий по книге
   */
  async getSessionsByBook(bookId: string): Promise<ReadingSessionWithDetails[]> {
    try {
      const result = await this.db
        .select({
          session: readingSessions,
          reader: {
            id: users.id,
            username: users.username,
            role: users.role,
            createdAt: users.createdAt,
          },
          book: books,
          club: clubs,
          listenerCount: count(sessionListeners.id),
        })
        .from(readingSessions)
        .leftJoin(users, eq(readingSessions.readerId, users.id))
        .leftJoin(books, eq(readingSessions.bookId, books.id))
        .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
        .leftJoin(sessionListeners, and(
          eq(sessionListeners.sessionId, readingSessions.id),
          eq(sessionListeners.isActive, true)
        ))
        .where(eq(readingSessions.bookId, bookId))
        .groupBy(readingSessions.id, users.id, books.id, clubs.id)
        .orderBy(desc(readingSessions.startedAt));

      return result.map(row => ({
        ...row.session,
        reader: row.reader!,
        book: row.book!,
        club: row.club!,
        listenerCount: Number(row.listenerCount),
      })) as ReadingSessionWithDetails[];
    } catch (error) {
      this.logError('getSessionsByBook', error);
      throw new Error('Failed to get sessions by book');
    }
  }

  /**
   * Получение сессий читателя
   */
  async getSessionsByReader(readerId: string): Promise<ReadingSessionWithDetails[]> {
    try {
      const result = await this.db
        .select({
          session: readingSessions,
          reader: {
            id: users.id,
            username: users.username,
            role: users.role,
            createdAt: users.createdAt,
          },
          book: books,
          club: clubs,
          listenerCount: count(sessionListeners.id),
        })
        .from(readingSessions)
        .leftJoin(users, eq(readingSessions.readerId, users.id))
        .leftJoin(books, eq(readingSessions.bookId, books.id))
        .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
        .leftJoin(sessionListeners, and(
          eq(sessionListeners.sessionId, readingSessions.id),
          eq(sessionListeners.isActive, true)
        ))
        .where(eq(readingSessions.readerId, readerId))
        .groupBy(readingSessions.id, users.id, books.id, clubs.id)
        .orderBy(desc(readingSessions.startedAt));

      return result.map(row => ({
        ...row.session,
        reader: row.reader!,
        book: row.book!,
        club: row.club!,
        listenerCount: Number(row.listenerCount),
      })) as ReadingSessionWithDetails[];
    } catch (error) {
      this.logError('getSessionsByReader', error);
      throw new Error('Failed to get sessions by reader');
    }
  }

  /**
   * Получение активной сессии читателя
   */
  async getActiveSessionForReader(readerId: string): Promise<ReadingSessionWithDetails | undefined> {
    try {
      const result = await this.db
        .select({
          session: readingSessions,
          reader: {
            id: users.id,
            username: users.username,
            role: users.role,
            createdAt: users.createdAt,
          },
          book: books,
          club: clubs,
          listenerCount: count(sessionListeners.id),
        })
        .from(readingSessions)
        .leftJoin(users, eq(readingSessions.readerId, users.id))
        .leftJoin(books, eq(readingSessions.bookId, books.id))
        .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
        .leftJoin(sessionListeners, and(
          eq(sessionListeners.sessionId, readingSessions.id),
          eq(sessionListeners.isActive, true)
        ))
        .where(and(
          eq(readingSessions.readerId, readerId),
          eq(readingSessions.isLive, true),
          eq(readingSessions.isActive, true)
        ))
        .groupBy(readingSessions.id, users.id, books.id, clubs.id)
        .orderBy(desc(readingSessions.startedAt))
        .limit(1);

      if (result.length === 0) return undefined;

      const row = result[0];
      return {
        ...row.session,
        reader: row.reader!,
        book: row.book!,
        club: row.club!,
        listenerCount: Number(row.listenerCount),
      } as ReadingSessionWithDetails;
    } catch (error) {
      this.logError('getActiveSessionForReader', error);
      throw new Error('Failed to get active session for reader');
    }
  }

  /**
   * Обновление позиции в сессии чтения
   */
  async updateSessionPosition(sessionId: string, currentChapter: number, currentPosition: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(readingSessions)
        .set({
          currentChapter,
          currentPosition
        })
        .where(eq(readingSessions.id, sessionId))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.logError('updateSessionPosition', error);
      throw new Error('Failed to update session position');
    }
  }

  /**
   * Обновление статуса сессии чтения
   */
  async updateSessionStatus(
    sessionId: string,
    status: 'active' | 'paused' | 'completed' | 'cancelled'
  ): Promise<ReadingSession | undefined> {
    try {
      const now = new Date();
      const updates: Partial<ReadingSession> = {};

      switch (status) {
        case 'active':
          updates.isActive = true;
          updates.isLive = true;
          updates.startedAt = now;
          updates.endedAt = null;
          break;
        case 'paused':
          updates.isActive = true;
          updates.isLive = false;
          break;
        case 'completed':
        case 'cancelled':
          updates.isActive = false;
          updates.isLive = false;
          updates.endedAt = now;
          break;
        default:
          break;
      }

      const result = await this.db
        .update(readingSessions)
        .set(updates)
        .where(eq(readingSessions.id, sessionId))
        .returning();

      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateSessionStatus', error);
      throw new Error('Failed to update session status');
    }
  }

  /**
   * Старт сессии чтения
   */
  async startSession(sessionId: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(readingSessions)
        .set({
          isLive: true,
          startedAt: new Date()
        })
        .where(eq(readingSessions.id, sessionId))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.logError('startSession', error);
      throw new Error('Failed to start session');
    }
  }

  /**
   * Завершение сессии чтения
   */
  async endSession(sessionId: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(readingSessions)
        .set({
          isLive: false,
          endedAt: new Date()
        })
        .where(eq(readingSessions.id, sessionId))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.logError('endSession', error);
      throw new Error('Failed to end session');
    }
  }

  // ============================================================
  // Session Listeners - Слушатели сессий
  // ============================================================

  /**
   * Присоединение к сессии чтения
   */
  async joinSession(sessionId: string, listenerId: string): Promise<SessionListener> {
    try {
      // Сначала деактивируем все активные сессии слушателя
      await this.db
        .update(sessionListeners)
        .set({
          isActive: false,
          leftAt: new Date()
        })
        .where(and(
          eq(sessionListeners.listenerId, listenerId),
          eq(sessionListeners.isActive, true)
        ));

      // Создаем новую запись слушателя
      const result = await this.db
        .insert(sessionListeners)
        .values({
          sessionId,
          listenerId,
        })
        .returning();

      return result[0];
    } catch (error) {
      this.logError('joinSession', error);
      throw new Error('Failed to join session');
    }
  }

  /**
   * Выход из сессии чтения
   */
  async leaveSession(sessionId: string, listenerId: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(sessionListeners)
        .set({
          isActive: false,
          leftAt: new Date()
        })
        .where(and(
          eq(sessionListeners.sessionId, sessionId),
          eq(sessionListeners.listenerId, listenerId),
          eq(sessionListeners.isActive, true)
        ))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.logError('leaveSession', error);
      throw new Error('Failed to leave session');
    }
  }

  /**
   * Получение списка слушателей сессии
   */
  async getSessionListeners(sessionId: string): Promise<User[]> {
    try {
      const result = await this.db
        .select({
          id: users.id,
          username: users.username,
          role: users.role,
          createdAt: users.createdAt,
        })
        .from(sessionListeners)
        .innerJoin(users, eq(sessionListeners.listenerId, users.id))
        .where(and(
          eq(sessionListeners.sessionId, sessionId),
          eq(sessionListeners.isActive, true)
        ))
        .orderBy(asc(sessionListeners.joinedAt));

      return result as User[];
    } catch (error) {
      this.logError('getSessionListeners', error);
      throw new Error('Failed to get session listeners');
    }
  }

  /**
   * Получение количества активных слушателей
   */
  async getActiveListenersCount(sessionId: string): Promise<number> {
    try {
      const result = await this.db
        .select({ count: count(sessionListeners.id) })
        .from(sessionListeners)
        .where(and(
          eq(sessionListeners.sessionId, sessionId),
          eq(sessionListeners.isActive, true)
        ));

      return Number(result[0]?.count || 0);
    } catch (error) {
      this.logError('getActiveListenersCount', error);
      throw new Error('Failed to get active listeners count');
    }
  }

  // ============================================================
  // Reading Progress - Прогресс чтения
  // ============================================================

  /**
   * Обновление прогресса чтения
   */
  async updateReadingProgress(progressData: InsertReadingProgress & { userId: string }): Promise<ReadingProgress> {
    try {
      // Проверяем существующую запись
      const existing = await this.db
        .select()
        .from(readingProgress)
        .where(and(
          eq(readingProgress.userId, progressData.userId),
          eq(readingProgress.bookId, progressData.bookId),
          progressData.clubId ? eq(readingProgress.clubId, progressData.clubId) : isNull(readingProgress.clubId)
        ))
        .limit(1);

      let result: ReadingProgress;

      if (existing.length > 0) {
        // Обновляем существующую запись
        const updated = await this.db
          .update(readingProgress)
          .set({
            currentChapter: progressData.currentChapter,
            currentPosition: progressData.currentPosition,
            progress: progressData.progress,
            lastReadAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(readingProgress.id, existing[0].id))
          .returning();

        result = updated[0];
      } else {
        // Создаем новую запись
        const inserted = await this.db
          .insert(readingProgress)
          .values({
            userId: progressData.userId,
            bookId: progressData.bookId,
            clubId: progressData.clubId,
            currentChapter: progressData.currentChapter,
            currentPosition: progressData.currentPosition,
            progress: progressData.progress,
          })
          .returning();

        result = inserted[0];
      }

      // Синхронизация с book_reading_status
      await this.syncBookReadingStatus(progressData.userId, progressData.bookId, progressData.clubId, progressData.progress ?? 0);

      return result;
    } catch (error) {
      this.logError('updateReadingProgress', error);
      throw new Error('Failed to update reading progress');
    }
  }

  /**
   * Проверка существования книги
   */
  private async bookExists(bookId: string, isClubBook: boolean): Promise<boolean> {
    if (isClubBook) {
      const [book] = await this.db
        .select()
        .from(clubBooks)
        .where(eq(clubBooks.id, bookId))
        .limit(1);
      return !!book;
    }
    
    const [book] = await this.db
      .select()
      .from(personalBooks)
      .where(eq(personalBooks.id, bookId))
      .limit(1);
    return !!book;
  }

  /**
   * Определение статуса и даты завершения на основе прогресса
   */
  private getStatusFromProgress(progress: number): { status: 'reading' | 'completed'; completedAt: Date | null } {
    if (progress >= 100) {
      return { status: 'completed', completedAt: new Date() };
    }
    return { status: 'reading', completedAt: null };
  }

  /**
   * Подготовка данных для обновления существующего статуса
   */
  private prepareUpdateData(status: 'reading' | 'completed', progress: number, existingStatus: any, completedAt: Date | null) {
    const updateData: any = {
      status,
      progress,
      updatedAt: new Date()
    };

    if (status === 'completed' && existingStatus.status !== 'completed') {
      updateData.completedAt = completedAt;
    }

    return updateData;
  }

  /**
   * Подготовка данных для создания нового статуса
   */
  private prepareInsertStatusData(userId: string, bookId: string, bookType: string, status: 'reading' | 'completed', progress: number, completedAt: Date | null) {
    const insertData: any = {
      userId,
      bookId,
      bookType,
      status,
      progress,
      startedAt: new Date()
    };

    if (status === 'completed') {
      insertData.completedAt = completedAt;
    }

    return insertData;
  }

  /**
   * Синхронизация book_reading_status при обновлении прогресса
   */
  private async syncBookReadingStatus(userId: string, bookId: string, clubId: string | null | undefined, progress: number): Promise<void> {
    try {
      const isClubBook = !!clubId;
      const bookType = isClubBook ? 'club' : 'personal';

      // Проверяем существование книги
      const exists = await this.bookExists(bookId, isClubBook);
      if (!exists) return;

      // Определяем статус
      const { status, completedAt } = this.getStatusFromProgress(progress);

      // Проверяем существующую запись
      const [existingStatus] = await this.db
        .select()
        .from(bookReadingStatus)
        .where(and(
          eq(bookReadingStatus.userId, userId),
          eq(bookReadingStatus.bookId, bookId),
          eq(bookReadingStatus.bookType, bookType)
        ))
        .limit(1);

      if (existingStatus) {
        const updateData = this.prepareUpdateData(status, progress, existingStatus, completedAt);
        await this.db
          .update(bookReadingStatus)
          .set(updateData)
          .where(eq(bookReadingStatus.id, existingStatus.id));
      } else {
        const insertData = this.prepareInsertStatusData(userId, bookId, bookType, status, progress, completedAt);
        await this.db
          .insert(bookReadingStatus)
          .values(insertData);
      }
    } catch (error) {
      this.logError('syncBookReadingStatus', error);
      // Не пробрасываем ошибку, чтобы не блокировать обновление прогресса
    }
  }

  /**
   * Получение прогресса чтения пользователя по книге
   */
  async getUserReadingProgress(userId: string, bookId: string): Promise<ReadingProgress | undefined> {
    try {
      const result = await this.db
        .select()
        .from(readingProgress)
        .where(and(
          eq(readingProgress.userId, userId),
          eq(readingProgress.bookId, bookId)
        ))
        .limit(1);

      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getUserReadingProgress', error);
      throw new Error('Failed to get user reading progress');
    }
  }

  /**
   * Получение прогресса чтения в клубе
   */
  async getClubReadingProgress(clubId: string): Promise<ReadingProgress[]> {
    try {
      const result = await this.db
        .select()
        .from(readingProgress)
        .where(eq(readingProgress.clubId, clubId))
        .orderBy(desc(readingProgress.lastReadAt));

      return result;
    } catch (error) {
      this.logError('getClubReadingProgress', error);
      throw new Error('Failed to get club reading progress');
    }
  }

  // ============================================================
  // Reading History - История чтения
  // ============================================================

  /**
   * Добавление завершенной книги в историю
   */
  async addCompletedToHistory(userId: string, bookId: string, bookTitle: string, bookAuthor: string, bookCoverUrl?: string): Promise<void> {
    try {
      await this.db
        .insert(readingHistory)
        .values({
          userId,
          bookId,
          bookTitle,
          bookAuthor,
          bookCoverUrl,
          completedAt: new Date(),
        });
    } catch (error) {
      this.logError('addCompletedToHistory', error);
      throw new Error('Failed to add completed book to history');
    }
  }

  /**
   * Получение истории чтения пользователя
   */
  async getReadingHistory(userId: string): Promise<ReadingHistory[]> {
    try {
      const result = await this.db
        .select()
        .from(readingHistory)
        .where(eq(readingHistory.userId, userId))
        .orderBy(desc(readingHistory.completedAt));

      return result;
    } catch (error) {
      this.logError('getReadingHistory', error);
      throw new Error('Failed to get reading history');
    }
  }

  /**
   * Очистка истории чтения пользователя
   */
  async clearReadingHistory(userId: string): Promise<void> {
    try {
      await this.db
        .delete(readingHistory)
        .where(eq(readingHistory.userId, userId));
    } catch (error) {
      this.logError('clearReadingHistory', error);
      throw new Error('Failed to clear reading history');
    }
  }

  // ============================================================
  // Reader Ratings - Рейтинги читателей
  // ============================================================

  /**
   * Оценить читателя
   */
  async rateReader(rating: InsertReaderRating & { raterId: string }): Promise<ReaderRating> {
    try {
      const result = await this.db
        .insert(readerRatings)
        .values(rating)
        .returning();

      return result[0];
    } catch (error) {
      this.logError('rateReader', error);
      throw new Error('Failed to rate reader');
    }
  }

  /**
   * Получение оценок читателя
   */
  async getReaderRatings(readerId: string): Promise<ReaderRating[]> {
    try {
      const result = await this.db
        .select()
        .from(readerRatings)
        .where(eq(readerRatings.readerId, readerId))
        .orderBy(desc(readerRatings.createdAt));

      return result;
    } catch (error) {
      this.logError('getReaderRatings', error);
      throw new Error('Failed to get reader ratings');
    }
  }

  /**
   * Получение средней оценки читателя
   */
  async getReaderAverageRating(readerId: string): Promise<number> {
    try {
      const ratings = await this.getReaderRatings(readerId);
      
      if (ratings.length === 0) return 0;

      const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
      return sum / ratings.length;
    } catch (error) {
      this.logError('getReaderAverageRating', error);
      throw new Error('Failed to get reader average rating');
    }
  }

  // ============================================================
  // User Profiles - Профили читателей
  // ============================================================

  /**
   * Создание или обновление профиля пользователя
   */
  async createOrUpdateUserProfile(userId: string, profile: InsertUserProfile): Promise<UserProfile> {
    try {
      const existing = await this.db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      if (existing.length > 0) {
        const result = await this.db
          .update(userProfiles)
          .set({
            ...profile,
            updatedAt: new Date()
          })
          .where(eq(userProfiles.userId, userId))
          .returning();

        return result[0];
      } else {
        const result = await this.db
          .insert(userProfiles)
          .values({
            ...profile,
            userId,
          })
          .returning();

        return result[0];
      }
    } catch (error) {
      this.logError('createOrUpdateUserProfile', error);
      throw new Error('Failed to create or update user profile');
    }
  }

  /**
   * Получение профиля пользователя
   */
  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    try {
      const result = await this.db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getUserProfile', error);
      throw new Error('Failed to get user profile');
    }
  }

  /**
   * Удаление профиля пользователя
   */
  async deleteUserProfile(userId: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.logError('deleteUserProfile', error);
      throw new Error('Failed to delete user profile');
    }
  }

  /**
   * Получение топ читателей
   */
  async getTopReaders(limit: number = 10): Promise<UserProfile[]> {
    try {
      const result = await this.db
        .select()
        .from(userProfiles)
        .orderBy(desc(userProfiles.totalReadingSessions), desc(userProfiles.totalListeners))
        .limit(limit);

      return result;
    } catch (error) {
      this.logError('getTopReaders', error);
      throw new Error('Failed to get top readers');
    }
  }
}
