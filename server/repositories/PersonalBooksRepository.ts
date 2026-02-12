import { BaseRepository } from './BaseRepository.js';
import { eq, and, desc } from 'drizzle-orm';
import { 
  personalBooks,
  readingProgress,
  bookAccessLogs,
  analyticsEvents,
  type PersonalBook,
  type InsertPersonalBook,
  type BookFormat
} from '../../shared/schema.js';

/**
 * Репозиторий для личных книг пользователей
 * Отвечает за управление личной библиотекой каждого пользователя
 */
export class PersonalBooksRepository extends BaseRepository {
  
  /**
   * Создание личной книги пользователя
   */
  async createPersonalBook(book: InsertPersonalBook & { userId: string }): Promise<PersonalBook> {
    try {
      const result = await this.db
        .insert(personalBooks)
        .values({
          userId: book.userId,
          title: book.title,
          author: book.author,
          description: book.description,
          publicationYear: book.publicationYear,
          genre: book.genre,
          language: book.language,
          format: book.format as BookFormat,
          fileHash: book.fileHash,
          fileSizeBytes: book.fileSizeBytes,
          storagePath: book.storagePath,
          encryptedContentKey: book.encryptedContentKey,
          coverUrl: book.coverUrl,
        })
        .returning();

      return result[0];
    } catch (error) {
      this.logError('createPersonalBook', error);
      throw new Error('Failed to create personal book');
    }
  }

  /**
   * Получение личной книги по ID
   */
  async getPersonalBook(id: string): Promise<PersonalBook | undefined> {
    try {
      const result = await this.db
        .select()
        .from(personalBooks)
        .where(eq(personalBooks.id, id))
        .limit(1);

      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getPersonalBook', error);
      throw new Error('Failed to get personal book');
    }
  }

  /**
   * Получение всех личных книг пользователя
   */
  async getPersonalBooksByUser(userId: string): Promise<PersonalBook[]> {
    try {
      const result = await this.db
        .select()
        .from(personalBooks)
        .where(and(
          eq(personalBooks.userId, userId),
          eq(personalBooks.isDeleted, false)
        ))
        .orderBy(desc(personalBooks.createdAt));

      return result;
    } catch (error) {
      this.logError('getPersonalBooksByUser', error);
      throw new Error('Failed to get personal books by user');
    }
  }

  /**
   * Обновление личной книги
   */
  async updatePersonalBook(id: string, updates: Partial<InsertPersonalBook>): Promise<PersonalBook | undefined> {
    try {
      const updateData: Partial<typeof personalBooks.$inferInsert> = {
        ...(updates as Partial<typeof personalBooks.$inferInsert>),
        updatedAt: new Date(),
      };

      const result = await this.db
        .update(personalBooks)
        .set(updateData)
        .where(eq(personalBooks.id, id))
        .returning();

      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updatePersonalBook', error);
      throw new Error('Failed to update personal book');
    }
  }

  /**
   * Мягкое удаление личной книги
   */
  async deletePersonalBook(id: string): Promise<boolean> {
    try {
      const result = await this.db.transaction(async (tx) => {
        const updated = await tx
          .update(personalBooks)
          .set({
            isDeleted: true,
            softDeletedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(personalBooks.id, id))
          .returning();

        if (updated.length === 0) {
          throw new Error('Personal book not found');
        }

        // Удаляем связанные данные
        await tx
          .delete(readingProgress)
          .where(eq(readingProgress.bookId, id));

        await tx
          .delete(bookAccessLogs)
          .where(and(eq(bookAccessLogs.bookId, id), eq(bookAccessLogs.bookType, "personal")))
          .catch((error: unknown) => {
            const pgError = error as { code?: string };
            if (pgError?.code === "42P01") return;
            throw error;
          });

        await tx
          .delete(analyticsEvents)
          .where(eq(analyticsEvents.bookId, id));

        return updated;
      });

      return result.length > 0;
    } catch (error) {
      this.logError('deletePersonalBook', error);
      throw new Error('Failed to delete personal book');
    }
  }

  /**
   * Восстановление удаленной личной книги
   */
  async restorePersonalBook(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(personalBooks)
        .set({
          isDeleted: false,
          softDeletedAt: null,
          updatedAt: new Date()
        })
        .where(eq(personalBooks.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      this.logError('restorePersonalBook', error);
      throw new Error('Failed to restore personal book');
    }
  }

  /**
   * Полное удаление личной книги из БД
   */
  async permanentDeletePersonalBook(id: string): Promise<boolean> {
    try {
      const result = await this.db.transaction(async (tx) => {
        await tx
          .delete(readingProgress)
          .where(eq(readingProgress.bookId, id));

        await tx
          .delete(bookAccessLogs)
          .where(and(eq(bookAccessLogs.bookId, id), eq(bookAccessLogs.bookType, "personal")))
          .catch((error: unknown) => {
            const pgError = error as { code?: string };
            if (pgError?.code === "42P01") return;
            throw error;
          });

        await tx
          .delete(analyticsEvents)
          .where(eq(analyticsEvents.bookId, id));

        const deleted = await tx
          .delete(personalBooks)
          .where(eq(personalBooks.id, id))
          .returning();

        return deleted;
      });

      return result.length > 0;
    } catch (error) {
      this.logError('permanentDeletePersonalBook', error);
      throw new Error('Failed to permanently delete personal book');
    }
  }
}
