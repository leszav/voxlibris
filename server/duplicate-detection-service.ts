/**
 * Duplicate Detection Service
 * Обнаруживает дубликаты книг по автору и названию с учётом различий в издательствах
 */

import { db } from './db.js';
import { personalBooks, clubBooks } from '../shared/schema.js';
import { and, eq } from 'drizzle-orm';

/**
 * Нормализация строки для сравнения
 * Убирает лишние пробелы, переводит в нижний регистр, удаляет специальные символы
 */
function normalizeString(str: string): string {
  if (!str) return '';
  
  const result = str
    .toLowerCase()
    .trim()
    .replaceAll(/\s+/g, ' ')
    // Нормализация кавычек
    .replaceAll('«', '"')
    .replaceAll('»', '"')
    .replaceAll('"', '"')
    .replaceAll('"', '"')
    .replaceAll("'", '"')
    .replaceAll("'", '"')
    // Нормализация тире
    .replaceAll('—', '-')
    .replaceAll('–', '-')
    // Удаление скобок
    .replaceAll('(', '')
    .replaceAll(')', '')
    .replaceAll('[', '')
    .replaceAll(']', '')
    .replaceAll('{', '')
    .replaceAll('}', '')
    .trim();
  
  console.log(`     [normalizeString] "${str}" → "${result}"`);
  
  return result;
}

/**
 * Вычисление расстояния Левенштейна (редакционное расстояние)
 * Используется для fuzzy matching названий книг
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // замена
          matrix[i][j - 1] + 1,     // вставка
          matrix[i - 1][j] + 1      // удаление
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Вычисление similarity score (0-100%)
 * 100% - полное совпадение, 0% - совершенно разные строки
 */
function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);

  console.log(`   → Сравнение: "${str1}" vs "${str2}"`);
  console.log(`   → Нормализовано: "${normalized1}" (${normalized1.length} символов) vs "${normalized2}" (${normalized2.length} символов)`);

  // Если одна из строк пуста или неполадка при нормализации
  if (!normalized1 || !normalized2) {
    console.log(`   ⚠️  Одна из строк пуста после нормализации - возвращаем 0%`);
    return 0;
  }

  if (normalized1 === normalized2) {
    console.log(`   → Точное совпадение после нормализации (100%)`);
    return 100;
  }

  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  
  const similarity = ((maxLength - distance) / maxLength) * 100;
  const result = Math.round(similarity);
  console.log(`   → Расстояние Левенштейна: ${distance}, макс длина: ${maxLength}, подобие: ${result}%`);
  return result;
}

/**
 * Интерфейс для дубликата
 */
export interface DuplicateMatch {
  bookId: string;
  title: string;
  author: string;
  type: 'personal' | 'club';
  clubId?: string;
  similarity: number; // 0-100%
  matchReason: string;
}

/**
 * Опции поиска дубликатов
 */
export interface DuplicateSearchOptions {
  title: string;
  author: string;
  userId: string;
  clubId?: string;
  similarityThreshold?: number; // По умолчанию 85%
}

/**
 * Сервис для обнаружения дубликатов книг
 */
export class DuplicateDetectionService {
  private readonly DEFAULT_SIMILARITY_THRESHOLD = 85;

  /**
   * Поиск дубликатов для личной библиотеки пользователя
   */
  async findPersonalBookDuplicates(
    userId: string,
    title: string,
    author: string,
    similarityThreshold: number = this.DEFAULT_SIMILARITY_THRESHOLD
  ): Promise<DuplicateMatch[]> {
    try {
      // Получаем все книги пользователя
      const userBooks = await db
        .select({
          id: personalBooks.id,
          title: personalBooks.title,
          author: personalBooks.author,
        })
        .from(personalBooks)
        .where(and(eq(personalBooks.userId, userId), eq(personalBooks.isDeleted, false)));

      const duplicates: DuplicateMatch[] = [];

      console.log(`🔍 [DuplicateDetection] Поиск дубликатов для личной книги "${title}" от "${author}"`);
      console.log(`   Найдено ${userBooks.length} книг у пользователя для сравнения`);

      for (const book of userBooks) {
        const titleSimilarity = calculateSimilarity(title, book.title);
        const authorSimilarity = calculateSimilarity(author, book.author);

        // Комбинированный score: автор важнее (60%), название (40%)
        const combinedScore = Math.round(authorSimilarity * 0.6 + titleSimilarity * 0.4);

        console.log(`   📖 "${book.title}" от "${book.author}": title=${titleSimilarity}%, author=${authorSimilarity}%, combined=${combinedScore}%`);

        if (combinedScore >= similarityThreshold) {
          let matchReason = '';
          
          if (titleSimilarity === 100 && authorSimilarity === 100) {
            matchReason = 'Точное совпадение автора и названия';
          } else if (titleSimilarity === 100) {
            matchReason = 'Точное совпадение названия, похожий автор';
          } else if (authorSimilarity === 100) {
            matchReason = 'Точное совпадение автора, похожее название';
          } else {
            matchReason = `Похожая книга (совпадение ${combinedScore}%)`;
          }

          duplicates.push({
            bookId: book.id,
            title: book.title,
            author: book.author,
            type: 'personal',
            similarity: combinedScore,
            matchReason,
          });
        }
      }

      // Сортировка по убыванию similarity
      return duplicates.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      console.error('[DuplicateDetection] Error finding personal book duplicates:', error);
      return [];
    }
  }

  /**
   * Поиск дубликатов для клубной библиотеки
   */
  async findClubBookDuplicates(
    clubId: string,
    title: string,
    author: string,
    similarityThreshold: number = this.DEFAULT_SIMILARITY_THRESHOLD
  ): Promise<DuplicateMatch[]> {
    try {
      // Получаем все книги клуба
      const books = await db
        .select({
          id: clubBooks.id,
          title: clubBooks.title,
          author: clubBooks.author,
          clubId: clubBooks.clubId,
        })
        .from(clubBooks)
        .where(and(eq(clubBooks.clubId, clubId), eq(clubBooks.isDeleted, false)));

      const duplicates: DuplicateMatch[] = [];

      console.log(`🔍 [DuplicateDetection] Поиск дубликатов для книги "${title}" от "${author}" в клубе ${clubId}`);
      console.log(`   Найдено ${books.length} книг в клубе для сравнения`);

      for (const book of books) {
        const titleSimilarity = calculateSimilarity(title, book.title);
        const authorSimilarity = calculateSimilarity(author, book.author);

        const combinedScore = Math.round(authorSimilarity * 0.6 + titleSimilarity * 0.4);

        console.log(`   📖 "${book.title}" от "${book.author}": title=${titleSimilarity}%, author=${authorSimilarity}%, combined=${combinedScore}%`);

        if (combinedScore >= similarityThreshold) {
          let matchReason = '';
          
          if (titleSimilarity === 100 && authorSimilarity === 100) {
            matchReason = 'Точное совпадение автора и названия';
          } else if (titleSimilarity === 100) {
            matchReason = 'Точное совпадение названия, похожий автор';
          } else if (authorSimilarity === 100) {
            matchReason = 'Точное совпадение автора, похожее название';
          } else {
            matchReason = `Похожая книга (совпадение ${combinedScore}%)`;
          }

          duplicates.push({
            bookId: book.id,
            title: book.title,
            author: book.author,
            type: 'club',
            clubId: book.clubId,
            similarity: combinedScore,
            matchReason,
          });
        }
      }

      return duplicates.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      console.error('[DuplicateDetection] Error finding club book duplicates:', error);
      return [];
    }
  }

  /**
   * Универсальный поиск дубликатов
   */
  async findDuplicates(options: DuplicateSearchOptions): Promise<DuplicateMatch[]> {
    const threshold = options.similarityThreshold || this.DEFAULT_SIMILARITY_THRESHOLD;

    if (options.clubId) {
      // Поиск дубликатов в клубной библиотеке
      return this.findClubBookDuplicates(
        options.clubId,
        options.title,
        options.author,
        threshold
      );
    } else {
      // Поиск дубликатов в личной библиотеке
      return this.findPersonalBookDuplicates(
        options.userId,
        options.title,
        options.author,
        threshold
      );
    }
  }

  /**
   * Проверка, является ли книга дубликатом (есть ли точное совпадение)
   */
  async isDuplicate(options: DuplicateSearchOptions): Promise<boolean> {
    const duplicates = await this.findDuplicates({
      ...options,
      similarityThreshold: 100, // Только точные совпадения
    });

    return duplicates.length > 0;
  }
}

// Экспорт синглтона
export const duplicateDetectionService = new DuplicateDetectionService();

// Экспорт утилит для использования в других местах
export { normalizeString, calculateSimilarity };
