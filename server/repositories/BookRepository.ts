import { BaseRepository } from './BaseRepository.js';
import { eq, desc, and, like, or } from 'drizzle-orm';
import { books, bookContent } from '../../shared/schema.js';
import type {
  Book,
  InsertBook,
  BookContent,
  InsertBookContent
} from '../../shared/schema.js';

/**
 * Book Domain Repository - единственная ответственность: управление книгами и контентом
 * Архитектурное решение: изоляция всей книжной логики от пользователей и клубов
 * Устраняет нарушение SRP в монолитном storage.ts
 */
export class BookRepository extends BaseRepository {
  
  /**
   * Получение всех доступных книг с сортировкой по дате создания
   */
  async getBooks(): Promise<Book[]> {
    try {
      return await this.db
        .select()
        .from(books)
        .orderBy(desc(books.createdAt));
    } catch (error) {
      this.logError('getBooks', error);
      return [];
    }
  }

  /**
   * Получение книги по ID с валидацией
   */
  async getBook(id: string): Promise<Book | undefined> {
    this.validateRequired(id, 'id');
    
    try {
      const result = await this.db
        .select()
        .from(books)
        .where(eq(books.id, id))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getBook', error);
      return undefined;
    }
  }

  /**
   * Поиск книги по хэшу контента для предотвращения дублирования
   */
  async getBookByContentHash(contentHash: string): Promise<Book | undefined> {
    this.validateRequired(contentHash, 'contentHash');
    
    try {
      const result = await this.db
        .select()
        .from(books)
        .where(eq(books.contentHash, contentHash))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getBookByContentHash', error);
      return undefined;
    }
  }

  /**
   * Получение книг пользователя
   */
  async getBooksByUser(userId: string): Promise<Book[]> {
    this.validateRequired(userId, 'userId');
    
    try {
      return await this.db
        .select()
        .from(books)
        .where(eq(books.uploadedBy, userId))
        .orderBy(desc(books.createdAt));
    } catch (error) {
      this.logError('getBooksByUser', error);
      return [];
    }
  }

  /**
   * Полнотекстовый поиск книг по названию и автору
   * Архитектурное решение: централизованная поисковая логика
   */
  async searchBooks(query: string): Promise<Book[]> {
    this.validateRequired(query, 'query');
    
    try {
      const searchTerm = `%${query.toLowerCase()}%`;
      
      return await this.db
        .select()
        .from(books)
        .where(
          or(
            like(books.title, searchTerm),
            like(books.author, searchTerm),
            like(books.description, searchTerm)
          )
        )
        .orderBy(desc(books.createdAt))
        .limit(50); // Ограничение для производительности
    } catch (error) {
      this.logError('searchBooks', error);
      return [];
    }
  }

  /**
   * Создание книги с транзакционной безопасностью
   */
  async createBook(book: InsertBook): Promise<Book> {
    this.validateRequired(book.title, 'title');
    this.validateRequired(book.author, 'author');
    // uploadedBy поле опционально в схеме
    
    try {
      const result = await this.db
        .insert(books)
        .values(book) // Удаляем попытку перезаписать createdAt/updatedAt - они устанавливаются автоматически
        .returning();
      
      const newBook = this.getFirstResult(result);
      if (!newBook) {
        throw new Error('CRITICAL: Book creation failed - no result returned');
      }
      
      return newBook;
    } catch (error) {
      this.logError('createBook', error);
      throw error;
    }
  }

  /**
   * Обновление метаданных книги
   */
  async updateBook(id: string, updates: Partial<InsertBook>): Promise<Book | undefined> {
    this.validateRequired(id, 'id');
    
    try {
      const result = await this.db
        .update(books)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(books.id, id))
        .returning();
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateBook', error);
      return undefined;
    }
  }

  /**
   * Безопасное удаление книги
   * Архитектурное решение: каскадное удаление связанного контента
   */
  async deleteBook(id: string): Promise<void> {
    this.validateRequired(id, 'id');
    
    try {
      // Сначала удаляем связанный контент
      await this.db
        .delete(bookContent)
        .where(eq(bookContent.bookId, id));
      
      // Затем удаляем саму книгу
      await this.db
        .delete(books)
        .where(eq(books.id, id));
        
    } catch (error) {
      this.logError('deleteBook', error);
      throw error;
    }
  }

  // =================================================================
  // Book Content Management - подответственность в рамках Book domain
  // =================================================================

  /**
   * Получение контента книги с опциональной фильтрацией по главам
   */
  async getBookContent(bookId: string, chapterNumber?: number): Promise<BookContent[]> {
    this.validateRequired(bookId, 'bookId');
    
    try {
      // Positive logic: default case first (get all chapters)
      if (chapterNumber === undefined) {
        return await this.db
          .select()
          .from(bookContent)
          .where(eq(bookContent.bookId, bookId))
          .orderBy(bookContent.chapterNumber);
      }
      
      // Specific chapter query
      return await this.db
        .select()
        .from(bookContent)
        .where(and(
          eq(bookContent.bookId, bookId),
          eq(bookContent.chapterNumber, chapterNumber)
        ))
        .orderBy(bookContent.chapterNumber);
    } catch (error) {
      this.logError('getBookContent', error);
      return [];
    }
  }

  /**
   * Получение конкретной главы книги
   */
  async getBookChapter(bookId: string, chapterNumber: number): Promise<BookContent | undefined> {
    this.validateRequired(bookId, 'bookId');
    
    try {
      const result = await this.db
        .select()
        .from(bookContent)
        .where(and(
          eq(bookContent.bookId, bookId),
          eq(bookContent.chapterNumber, chapterNumber)
        ))
        .limit(1);
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('getBookChapter', error);
      return undefined;
    }
  }

  /**
   * Создание контента книги
   */
  async createBookContent(content: InsertBookContent): Promise<BookContent> {
    this.validateRequired(content.bookId, 'bookId');
    this.validateRequired(content.content, 'content');
    
    try {
      const result = await this.db
        .insert(bookContent)
        .values(content) // createdAt устанавливается автоматически в схеме
        .returning();
      
      const newContent = this.getFirstResult(result);
      if (!newContent) {
        throw new Error('CRITICAL: BookContent creation failed');
      }
      
      return newContent;
    } catch (error) {
      this.logError('createBookContent', error);
      throw error;
    }
  }

  /**
   * Обновление контента книги
   */
  async updateBookContent(id: string, updates: Partial<InsertBookContent>): Promise<BookContent | undefined> {
    this.validateRequired(id, 'id');
    
    try {
      const result = await this.db
        .update(bookContent)
        .set(updates) // Убираем updatedAt - поля нет в схеме
        .where(eq(bookContent.id, id))
        .returning();
      
      return this.getFirstResult(result);
    } catch (error) {
      this.logError('updateBookContent', error);
      return undefined;
    }
  }

  /**
   * Удаление контента книги
   */
  async deleteBookContent(id: string): Promise<void> {
    this.validateRequired(id, 'id');
    
    try {
      await this.db
        .delete(bookContent)
        .where(eq(bookContent.id, id));
        
    } catch (error) {
      this.logError('deleteBookContent', error);
      throw error;
    }
  }
}
