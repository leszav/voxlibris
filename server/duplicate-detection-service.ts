/**
 * Duplicate Detection Service
 * Обнаруживает дубликаты книг по автору и названию с учётом различий в издательствах
 */

import { db } from './db.js';
import { personalBooks, clubBooks } from '../shared/schema.js';
import { and, eq } from 'drizzle-orm';
import { logger } from './lib/logger.js';

/**
 * Нормализация строки для сравнения
 * Убирает лишние пробелы, переводит в нижний регистр, удаляет специальные символы
 */
function normalizeString(str: string): string {
  if (!str) return '';
  
  return str
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
}

function hasTokenOverlap(a: string, b: string): boolean {
  const tokensA = a.split(' ').filter((token) => token.length >= 3);
  const tokensB = b.split(' ').filter((token) => token.length >= 3);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return true;
  }

  const tokenSetA = new Set(tokensA);
  for (const token of tokensB) {
    if (tokenSetA.has(token)) {
      return true;
    }
  }

  return false;
}

function isLikelyComparable(normalized1: string, normalized2: string): boolean {
  const maxLength = Math.max(normalized1.length, normalized2.length);
  const lengthDiff = Math.abs(normalized1.length - normalized2.length);

  if (lengthDiff > Math.max(8, Math.floor(maxLength * 0.6))) {
    const isSubstring = normalized1.includes(normalized2) || normalized2.includes(normalized1);
    if (!isSubstring) {
      return false;
    }
  }

  if (!hasTokenOverlap(normalized1, normalized2)) {
    return false;
  }

  return true;
}

/**
 * Вычисление расстояния Левенштейна (редакционное расстояние)
 * Используется для fuzzy matching названий книг
 */
function levenshteinDistance(a: string, b: string): number {
  let left = a;
  let right = b;

  if (left.length > right.length) {
    [left, right] = [right, left];
  }

  const leftLength = left.length;
  const rightLength = right.length;
  const previous = new Array<number>(leftLength + 1);
  const current = new Array<number>(leftLength + 1);

  for (let i = 0; i <= leftLength; i++) {
    previous[i] = i;
  }

  for (let i = 1; i <= rightLength; i++) {
    current[0] = i;
    const rightCode = right.charCodeAt(i - 1);

    for (let j = 1; j <= leftLength; j++) {
      const cost = left.charCodeAt(j - 1) === rightCode ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }

    for (let j = 0; j <= leftLength; j++) {
      previous[j] = current[j];
    }
  }

  return previous[leftLength];
}

function calculateSimilarityFromNormalized(normalized1: string, normalized2: string): number {
  if (!normalized1 || !normalized2) {
    return 0;
  }

  if (normalized1 === normalized2) {
    return 100;
  }

  if (!isLikelyComparable(normalized1, normalized2)) {
    return 0;
  }

  const maxLength = Math.max(normalized1.length, normalized2.length);
  const distance = levenshteinDistance(normalized1, normalized2);
  return Math.max(0, Math.round(((maxLength - distance) / maxLength) * 100));
}

/**
 * Вычисление similarity score (0-100%)
 * 100% - полное совпадение, 0% - совершенно разные строки
 */
function calculateSimilarity(str1: string, str2: string): number {
  return calculateSimilarityFromNormalized(normalizeString(str1), normalizeString(str2));
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
      const normalizedTitle = normalizeString(title);
      const normalizedAuthor = normalizeString(author);

      for (const book of userBooks) {
        const titleSimilarity = calculateSimilarityFromNormalized(normalizedTitle, normalizeString(book.title));
        const authorSimilarity = calculateSimilarityFromNormalized(normalizedAuthor, normalizeString(book.author));

        // Комбинированный score: автор важнее (60%), название (40%)
        const combinedScore = Math.round(authorSimilarity * 0.6 + titleSimilarity * 0.4);

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

      logger.debug(
        {
          userId,
          candidateCount: userBooks.length,
          duplicateCount: duplicates.length,
        },
        '[DuplicateDetection] personal duplicate scan completed',
      );

      // Сортировка по убыванию similarity
      return duplicates.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      logger.error({ error }, '[DuplicateDetection] Error finding personal book duplicates');
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
      const normalizedTitle = normalizeString(title);
      const normalizedAuthor = normalizeString(author);

      for (const book of books) {
        const titleSimilarity = calculateSimilarityFromNormalized(normalizedTitle, normalizeString(book.title));
        const authorSimilarity = calculateSimilarityFromNormalized(normalizedAuthor, normalizeString(book.author));

        const combinedScore = Math.round(authorSimilarity * 0.6 + titleSimilarity * 0.4);

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

      logger.debug(
        {
          clubId,
          candidateCount: books.length,
          duplicateCount: duplicates.length,
        },
        '[DuplicateDetection] club duplicate scan completed',
      );

      return duplicates.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      logger.error({ error }, '[DuplicateDetection] Error finding club book duplicates');
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
