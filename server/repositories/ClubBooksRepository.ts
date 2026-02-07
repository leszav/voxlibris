import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc, asc, isNotNull } from 'drizzle-orm';
import { 
  clubBooks,
  clubBookmarks,
  clubReadingPlans,
  readingProgress,
  bookAccessLogs,
  analyticsEvents,
  type ClubBook,
  type InsertClubBook
} from '../../shared/schema.js';

/**
 * Репозиторий для книг клубов
 * Управляет книгами, доступными для совместного чтения в клубах
 */
export class ClubBooksRepository extends BaseRepository {
  
  /**
   * Создание книги клуба
   */
  async createClubBook(book: InsertClubBook & { uploadedByUserId: string }): Promise<ClubBook> {
    try {
      const result = await this.db
        .insert(clubBooks)
        .values({
          ...book,
          format: book.format as any,
          uploadedByUserId: book.uploadedByUserId,
          isDeleted: false,
        })
        .returning();

      return result[0];
    } catch (error) {
      this.logError('createClubBook', error);
      throw new Error('Failed to create club book');
    }
  }

  /**
   * Получение книги клуба по ID
   */
  async getClubBook(id: string): Promise<ClubBook | undefined> {
    try {
      const result = await this.db
        .select()
        .from(clubBooks)
        .where(eq(clubBooks.id, id))
        .limit(1);

      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getClubBook', error);
      throw new Error('Failed to get club book');
    }
  }

  /**
   * Получение всех книг конкретного клуба
   */
  async getClubBooksByClub(clubId: string): Promise<ClubBook[]> {
    try {
      console.log('[ClubBooksRepository] Getting club books for club:', clubId);
      
      const result = await this.db
        .select()
        .from(clubBooks)
        .where(and(
          eq(clubBooks.clubId, clubId),
          eq(clubBooks.isDeleted, false)
        ))
        .orderBy(asc(clubBooks.recommendedReadingOrder), desc(clubBooks.createdAt));

      return result;
    } catch (error) {
      this.logError('getClubBooksByClub', error);
      throw new Error('Failed to get club books by club');
    }
  }

  /**
   * Получение всех книг клубов (для админки)
   */
  async getAllClubBooks(): Promise<ClubBook[]> {
    try {
      const result = await this.db
        .select()
        .from(clubBooks)
        .orderBy(desc(clubBooks.createdAt));

      return result;
    } catch (error) {
      this.logError('getAllClubBooks', error);
      throw new Error('Failed to get all club books');
    }
  }

  /**
   * Обновление книги клуба
   */
  async updateClubBook(id: string, updates: Partial<InsertClubBook>): Promise<ClubBook | undefined> {
    try {
      const result = await this.db
        .update(clubBooks)
        .set({
          ...updates,
          format: updates.format as "FB2" | "EPUB" | undefined,
          updatedAt: new Date()
        })
        .where(eq(clubBooks.id, id))
        .returning();

      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateClubBook', error);
      throw new Error('Failed to update club book');
    }
  }

  /**
   * Мягкое удаление книги клуба
   */
  async deleteClubBook(id: string): Promise<boolean> {
    try {
      const result = await this.db.transaction(async (tx) => {
        const updated = await tx
          .update(clubBooks)
          .set({
            isDeleted: true,
            softDeletedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(clubBooks.id, id))
          .returning();

        if (updated.length === 0) {
          throw new Error('Club book not found');
        }

        // Удаляем связанные данные
        await tx
          .delete(clubBookmarks)
          .where(eq(clubBookmarks.clubBookId, id));

        await tx
          .delete(clubReadingPlans)
          .where(eq(clubReadingPlans.clubBookId, id));

        await tx
          .delete(readingProgress)
          .where(and(eq(readingProgress.bookId, id), isNotNull(readingProgress.clubId)));

        await tx
          .delete(bookAccessLogs)
          .where(and(eq(bookAccessLogs.bookId, id), eq(bookAccessLogs.bookType, "CLUB")))
          .catch((error: any) => {
            if (error?.code === "42P01") return;
            throw error;
          });

        await tx
          .delete(analyticsEvents)
          .where(eq(analyticsEvents.bookId, id));

        return updated;
      });

      return result.length > 0;
    } catch (error) {
      this.logError('deleteClubBook', error);
      throw new Error('Failed to delete club book');
    }
  }

  /**
   * Восстановление удаленной книги клуба
   */
  async restoreClubBook(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(clubBooks)
        .set({
          isDeleted: false,
          softDeletedAt: null,
          updatedAt: new Date()
        })
        .where(eq(clubBooks.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.logError('restoreClubBook', error);
      throw new Error('Failed to restore club book');
    }
  }

  /**
   * Полное удаление книги клуба из БД
   */
  async permanentDeleteClubBook(id: string): Promise<boolean> {
    try {
      const result = await this.db.transaction(async (tx) => {
        // Удаляем club_bookmarks (если таблица существует)
        try {
          await tx
            .delete(clubBookmarks)
            .where(eq(clubBookmarks.clubBookId, id));
        } catch (error: any) {
          // Игнорируем ошибку "таблица не существует" (код 42P01)
          if (error?.code !== "42P01") {
            console.error('Error deleting club_bookmarks:', error);
            throw error;
          }
        }

        // Удаляем планы чтения
        await tx
          .delete(clubReadingPlans)
          .where(eq(clubReadingPlans.clubBookId, id));

        // Удаляем прогресс чтения для клубных книг
        await tx
          .delete(readingProgress)
          .where(and(eq(readingProgress.bookId, id), isNotNull(readingProgress.clubId)));

        // Удаляем логи доступа к книге (если таблица существует)
        await tx
          .delete(bookAccessLogs)
          .where(and(eq(bookAccessLogs.bookId, id), eq(bookAccessLogs.bookType, "CLUB")))
          .catch((error: any) => {
            // Игнорируем ошибку "таблица не существует"
            if (error?.code === "42P01") return;
            throw error;
          });

        // Удаляем события аналитики (может не быть FK, поэтому удаляем явно)
        try {
          await tx
            .delete(analyticsEvents)
            .where(eq(analyticsEvents.bookId, id));
        } catch (error: any) {
          // Игнорируем любые ошибки FK для analyticsEvents
          console.warn('Could not delete analytics events for book:', error?.message);
        }

        // Наконец, удаляем саму книгу (каскадное удаление сработает для связанных таблиц с ON DELETE CASCADE)
        const deleted = await tx
          .delete(clubBooks)
          .where(eq(clubBooks.id, id))
          .returning();

        return deleted;
      });

      return result.length > 0;
    } catch (error) {
      this.logError('permanentDeleteClubBook', error);
      throw new Error('Failed to permanently delete club book');
    }
  }
}
